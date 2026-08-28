from __future__ import annotations

import json
import os
import random
import string
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db import SessionLocal, init_db
from models import (
    ActivityLog,
    AppSetting,
    GradeRecord,
    Notice,
    PlatformNotice,
    School,
    SchoolAsset,
    SchoolClass,
    SchoolReport,
    Student,
    User,
)
from settings import Settings


settings = Settings()
pwd_context = CryptContext(
    schemes=["argon2"], deprecated="auto", argon2__time_cost=1, argon2__memory_cost=65536
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

CLASSES = ["FORM 1", "FORM 2", "FORM 3", "FORM 4"]
TERMS = ["First Term", "Second Term", "Third Term"]
FORM_1_2_CLASSES = {"FORM 1", "FORM 2"}

# ----- Grading (proven Lidoma logic, reused) -----


def calc_grade_backend(score: int, student_class: str) -> dict:
    is_f12 = student_class in FORM_1_2_CLASSES
    if is_f12:
        for g, th in [("A", 80), ("B", 70), ("C", 60), ("D", 50), ("E", 40)]:
            if score >= th:
                return {"grade": g, "points": 1, "result": "PASS"}
        return {"grade": "U" if score >= 31 else "F", "points": 0, "result": "FAIL"}
    # FORM 3 & 4
    for g, pts, res, th in [
        ("1", 1, "DIST", 90),
        ("2", 2, "DIST", 80),
        ("3", 3, "STRONG CREDIT", 70),
        ("4", 4, "CRED", 66),
        ("5", 5, "CRED", 60),
        ("6", 6, "CRED", 50),
        ("7", 7, "PASS", 46),
        ("8", 8, "PASS", 40),
    ]:
        if score >= th:
            return {"grade": g, "points": pts, "result": res}
    return {"grade": "9", "points": 9, "result": "FAIL"}


def calc_f34_aggregate(records: list, student_class: str) -> float:
    if not records:
        return 0.0
    eng = next((r for r in records if r.subject.strip().lower() == "english"), None)
    if eng is None:
        return 0.0
    if calc_grade_backend(eng.score, student_class)["result"] == "FAIL":
        return 99.0
    eng_points = calc_grade_backend(eng.score, student_class)["points"]
    other = sorted(
        calc_grade_backend(r.score, student_class)["points"]
        for r in records
        if r.subject.strip().lower() != "english"
    )
    return float(eng_points + sum(other[:5]))


# ----- App -----

app = FastAPI(title="Clique for Schools API", version="1.0.0")

allowed_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins + ["null", "file://"],
    allow_origin_regex=r"^https?://([a-z0-9-]+\.)*(vercel\.app|replit\.dev|replit\.app|pages\.dev)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"


def _serve_frontend():
    """Mount the built React frontend so a single service hosts both API and UI."""
    dist = _FRONTEND_DIST
    if not (dist / "index.html").exists():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _hash_password(p: str) -> str:
    return pwd_context.hash(p)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _make_code() -> str:
    return "CLQ-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def _create_access_token(sub: str, role: str, school_id: int | None = None) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.jwt_minutes)
    payload = {
        "sub": sub,
        "role": role,
        "school_id": school_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


# ----- Schemas -----


class SchoolRegisterIn(BaseModel):
    school_name: str = Field(..., min_length=2, max_length=200)
    district: str | None = Field(default=None, max_length=120)
    head_teacher: str | None = Field(default=None, max_length=120)
    contact_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    admin_name: str = Field(..., min_length=1, max_length=120)
    admin_username: str = Field(..., min_length=3, max_length=64)
    admin_password: str = Field(..., min_length=6, max_length=128)


class SchoolOut(BaseModel):
    id: int
    name: str
    code: str
    district: str | None = None
    head_teacher: str | None = None
    email: str | None = None
    phone: str | None = None
    contact_name: str | None = None
    status: str
    plan: str | None = None
    created_at: datetime
    approved_at: datetime | None = None


class ManualSchoolIn(BaseModel):
    school_name: str = Field(..., min_length=2, max_length=200)
    district: str | None = None
    head_teacher: str | None = None
    email: str | None = None
    contact_name: str | None = None
    admin_username: str = Field(..., min_length=3, max_length=64)
    admin_password: str = Field(..., min_length=6, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    role: str
    school_id: int | None = None
    school: SchoolOut | None = None


class SettingsIn(BaseModel):
    school_name: str | None = Field(default=None, max_length=200)
    academic_year: str | None = Field(default=None, max_length=32)
    report_title: str | None = Field(default=None, max_length=200)


class SettingsOut(BaseModel):
    school_name: str | None = None
    academic_year: str | None = None
    report_title: str | None = None


class StudentIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    student_class: str = Field(..., min_length=1, max_length=32)
    admission_number: str | None = Field(default=None, min_length=3, max_length=32)


class GradeIn(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=32)
    subject: str = Field(..., min_length=1, max_length=64)
    score: int = Field(..., ge=0, le=100)
    term: str | None = Field(default=None, max_length=32)
    academic_year: str | None = Field(default=None, max_length=32)
    teacher_comment: str | None = Field(default=None, max_length=240)


class NoticeIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    audience: str | None = Field(default=None, max_length=64)


# ----- Platform admin: extended models -----


class SchoolEditIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    district: str | None = Field(default=None, max_length=120)
    head_teacher: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=64)
    contact_name: str | None = Field(default=None, max_length=120)


class PlanIn(BaseModel):
    plan: str = Field(..., min_length=1, max_length=64)
    billing_status: str | None = Field(default=None, max_length=24)


class ResetPasswordIn(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


class PlatformAdminCreateIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class PlatformNoticeIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1)
    audience: str | None = Field(default=None, max_length=24)
    school_id: int | None = Field(default=None)


class SchoolDetailOut(SchoolOut):
    admin: dict | None = None
    student_count: int = 0
    class_count: int = 0
    report_count: int = 0
    billing_status: str | None = None
    plan_updated_at: datetime | None = None


# ----- Auth dependencies -----


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[Session, Depends(get_db)]
) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    except JWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from e
    user = db.scalar(select(User).where(User.username == sub))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid user")
    return user


def require_school_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role == "platform_admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Use the platform API")
    if not user.school_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No school attached")
    return user


def require_school_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "School admin only")
    if not user.school_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No school attached")
    return user


def require_platform_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "platform_admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform admin only")
    return user


def _school_ok(db: Session, school_id: int) -> School:
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    if school.status != "active":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"School access is {'pending approval' if school.status == 'provisional' else 'not permitted'}",
        )
    return school


# ----- Settings (per school) -----


def _read_settings(db: Session, school_id: int) -> SettingsOut:
    rows = db.scalars(select(AppSetting).where(AppSetting.school_id == school_id)).all()
    d = {r.key: r.value for r in rows}
    school = db.scalar(select(School).where(School.id == school_id))
    return SettingsOut(
        school_name=d.get("school_name") or (school.name if school else None),
        academic_year=d.get("academic_year"),
        report_title=d.get("report_title"),
    )


def _report_summaries(db: Session, school_id: int):
    reports = db.scalars(
        select(SchoolReport)
        .where(SchoolReport.school_id == school_id)
        .order_by(SchoolReport.academic_year.desc(), SchoolReport.created_at.desc())
    ).all()
    return [
        {
            "id": r.id,
            "student_id": r.student_id,
            "student_name": r.student_name,
            "student_class": r.student_class,
            "term": r.term,
            "academic_year": r.academic_year,
            "total_subjects": r.total_subjects,
            "average_score": r.average_score,
            "aggregate_points": r.aggregate_points,
            "position": r.position,
            "created_at": r.created_at.isoformat(),
        }
        for r in reports
    ]


def _sync_report(db: Session, school_id: int, student: Student, term: str, year: str) -> None:
    records = db.scalars(
        select(GradeRecord)
        .where(GradeRecord.school_id == school_id)
        .where(GradeRecord.student_id == student.student_id)
        .where(GradeRecord.term == term)
        .where(GradeRecord.academic_year == year)
    ).all()
    scores = [r.score for r in records]
    avg = sum(scores) / len(scores) if scores else 0.0
    is_f12 = student.student_class in FORM_1_2_CLASSES
    aggregate = avg if is_f12 else calc_f34_aggregate(records, student.student_class)
    cfg = _read_settings(db, school_id)
    report_data = {
        "school_name": cfg.school_name,
        "student_id": student.student_id,
        "student_name": student.name,
        "student_class": student.student_class,
        "term": term,
        "academic_year": year,
        "subjects": [
            {
                "subject": r.subject,
                "score": r.score,
                "grade": calc_grade_backend(r.score, student.student_class)["grade"],
                "result": calc_grade_backend(r.score, student.student_class)["result"],
                "comment": r.teacher_comment,
            }
            for r in records
        ],
        "average_score": avg,
        "aggregate": aggregate,
        "is_form1_or_2": is_f12,
        "has_grades": len(records) > 0,
    }
    existing = db.scalar(
        select(SchoolReport)
        .where(SchoolReport.school_id == school_id)
        .where(SchoolReport.student_id == student.student_id)
        .where(SchoolReport.term == term)
        .where(SchoolReport.academic_year == year)
    )
    if existing:
        existing.report_data = json.dumps(report_data)
        existing.average_score = avg
        existing.aggregate_points = aggregate
        existing.total_subjects = len(records)
        existing.student_name = student.name
        existing.student_class = student.student_class
    else:
        db.add(
            SchoolReport(
                school_id=school_id,
                student_id=student.student_id,
                student_name=student.name,
                student_class=student.student_class,
                term=term,
                academic_year=year,
                total_subjects=len(records),
                average_score=avg,
                aggregate_points=aggregate,
                report_data=json.dumps(report_data),
            )
        )


def _current_term(db: Session, school_id: int) -> tuple[str, str]:
    cfg = _read_settings(db, school_id)
    year = cfg.academic_year or str(datetime.now().year)
    return months_term(datetime.now().month), year


def months_term(month: int) -> str:
    # First Term ~ Jan-Apr, Second Term ~ May-Jul, Third Term ~ Aug-Dec
    if month <= 4:
        return "First Term"
    if month <= 7:
        return "Second Term"
    return "Third Term"


# ================= Public =================


@app.get("/api/health")
@app.get("/api/healthz")
def health():
    return {"ok": True}


@app.post("/api/register", response_model=SchoolOut)
def register_school(payload: SchoolRegisterIn, db: Annotated[Session, Depends(get_db)]):
    """A school self-registers -> created as 'provisional' until a platform admin approves."""
    existing = db.scalar(select(User).where(User.username == payload.admin_username))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "That admin username is already taken")

    school = School(
        name=payload.school_name,
        code=_make_code(),
        district=payload.district,
        head_teacher=payload.head_teacher,
        email=payload.email,
        phone=payload.phone,
        contact_name=payload.contact_name,
        status="provisional",
    )
    db.add(school)
    db.flush()
    db.add(
        User(
            school_id=school.id,
            username=payload.admin_username,
            password_hash=_hash_password(payload.admin_password),
            role="admin",
            name=payload.admin_name,
            is_active=True,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Registration failed. Try a different username.")
    db.refresh(school)
    return _school_out(school)


@app.post("/api/auth/login", response_model=TokenOut)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], db: Annotated[Session, Depends(get_db)]
):
    user = db.scalar(select(User).where(User.username == form.username))
    if not user or not user.is_active or not _verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")

    school = None
    if user.school_id:
        school = db.scalar(select(School).where(School.id == user.school_id))
        if school and school.status != "active":
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Your school is {'pending approval' if school.status == 'provisional' else 'not active'}. "
                "Please wait for Clique to activate it.",
            )

    return TokenOut(
        access_token=_create_access_token(user.username, user.role, user.school_id),
        token_type="bearer",
        role=user.role,
        school_id=user.school_id,
        school=_school_out(school) if school else None,
    )


# ================= Platform admin =================


@app.get("/api/platform/schools", response_model=list[SchoolOut])
def platform_schools(
    _: Annotated[User, Depends(require_platform_admin)], db: Annotated[Session, Depends(get_db)]
):
    rows = db.scalars(
        select(School).order_by(School.created_at.desc())
    ).all()
    return [_school_out(s) for s in rows]


@app.post("/api/platform/schools/{school_id}/approve", response_model=SchoolOut)
def approve_school(
    school_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    school.status = "active"
    school.approved_at = datetime.now(timezone.utc)
    _seed_school_defaults(db, school_id)
    _log_activity(db, actor.username, "school.approved", f"Approved {school.name}", school.id)
    db.commit()
    db.refresh(school)
    return _school_out(school)


@app.post("/api/platform/schools/{school_id}/deny", response_model=SchoolOut)
def deny_school(
    school_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    school.status = "rejected"
    _log_activity(db, actor.username, "school.rejected", f"Rejected {school.name}", school.id)
    db.commit()
    db.refresh(school)
    return _school_out(school)


@app.post("/api/platform/schools/manual", response_model=SchoolOut)
def manual_create_school(
    payload: ManualSchoolIn,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """A platform admin manually provisions a school + admin account, then shares login details."""
    existing = db.scalar(select(User).where(User.username == payload.admin_username))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Admin username already taken")
    school = School(
        name=payload.school_name,
        code=_make_code(),
        district=payload.district,
        head_teacher=payload.head_teacher,
        email=payload.email,
        contact_name=payload.contact_name,
        status="active",
        approved_at=datetime.now(timezone.utc),
    )
    db.add(school)
    db.flush()
    db.add(
        User(
            school_id=school.id,
            username=payload.admin_username,
            password_hash=_hash_password(payload.admin_password),
            role="admin",
            name=payload.contact_name,
            is_active=True,
        )
    )
    try:
        _seed_school_defaults(db, school.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Provisioning failed")
    db.refresh(school)
    return _school_out(school)


@app.get("/api/platform/stats")
def platform_stats(
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Overview counts for the platform dashboard."""
    total = db.scalar(select(func.count()).select_from(School)) or 0
    provisional = db.scalar(
        select(func.count()).select_from(School).where(School.status == "provisional")
    ) or 0
    active = db.scalar(
        select(func.count()).select_from(School).where(School.status == "active")
    ) or 0
    rejected = db.scalar(
        select(func.count()).select_from(School).where(School.status == "rejected")
    ) or 0
    suspended = db.scalar(
        select(func.count()).select_from(School).where(School.status == "suspended")
    ) or 0
    students = db.scalar(select(func.count()).select_from(Student)) or 0
    reports = db.scalar(select(func.count()).select_from(SchoolReport)) or 0
    admins = db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == "platform_admin")
    ) or 0

    by_plan: dict[str, int] = {}
    for plan, cnt in db.execute(
        select(School.plan, func.count()).where(
            School.plan.isnot(None), School.plan != ""
        ).group_by(School.plan)
    ).all():
        by_plan[plan or "None"] = cnt

    recent = db.scalars(
        select(School).order_by(School.created_at.desc()).limit(6)
    ).all()

    return {
        "total": total,
        "provisional": provisional,
        "active": active,
        "rejected": rejected,
        "suspended": suspended,
        "students": students,
        "reports": reports,
        "platformAdmins": admins,
        "byPlan": by_plan,
        "recentSchools": [
            {
                "id": s.id,
                "name": s.name,
                "code": s.code,
                "status": s.status,
                "plan": s.plan,
                "district": s.district,
                "created_at": s.created_at.isoformat(),
            }
            for s in recent
        ],
    }


@app.get("/api/platform/schools/{school_id}", response_model=SchoolDetailOut)
def platform_school_detail(
    school_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    return _school_detail(db, school)


@app.post("/api/platform/schools/{school_id}/suspend", response_model=SchoolOut)
def suspend_school(
    school_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    school.status = "suspended"
    _log_activity(db, actor.username, "school.suspended", f"Suspended {school.name}", school.id)
    db.commit()
    db.refresh(school)
    return _school_out(school)


@app.post("/api/platform/schools/{school_id}/resume", response_model=SchoolOut)
def resume_school(
    school_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    if school.status == "suspended":
        school.status = "active"
    elif school.status == "rejected":
        school.status = "active"
        if not school.approved_at:
            school.approved_at = datetime.now(timezone.utc)
        _seed_school_defaults(db, school_id)
    _log_activity(db, actor.username, "school.resumed", f"Resumed {school.name}", school.id)
    db.commit()
    db.refresh(school)
    return _school_out(school)


@app.post("/api/platform/schools/{school_id}/reactivate", response_model=SchoolOut)
def reactivate_school(
    school_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Reactivate a previously rejected school."""
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    school.status = "active"
    school.approved_at = school.approved_at or datetime.now(timezone.utc)
    _seed_school_defaults(db, school_id)
    _log_activity(db, actor.username, "school.reactivated", f"Reactivated {school.name}", school.id)
    db.commit()
    db.refresh(school)
    return _school_out(school)


@app.delete("/api/platform/schools/{school_id}")
def delete_school(
    school_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    db.delete(
        school  # cascade deletes users/students/grades/reports via FK ondelete
    )
    _log_activity(db, actor.username, "school.deleted", f"Deleted {school.name}")
    db.commit()
    return {"ok": True}


@app.patch("/api/platform/schools/{school_id}", response_model=SchoolOut)
def edit_school(
    school_id: int,
    payload: SchoolEditIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    for field in ("name", "district", "head_teacher", "email", "phone", "contact_name"):
        val = getattr(payload, field)
        if val is not None:
            setattr(school, field, val)
    _log_activity(db, actor.username, "school.edited", f"Edited {school.name}", school.id)
    db.commit()
    db.refresh(school)
    return _school_out(school)


@app.put("/api/platform/schools/{school_id}/plan", response_model=SchoolOut)
def update_school_plan(
    school_id: int,
    payload: PlanIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    school.plan = payload.plan
    if payload.billing_status is not None:
        school.billing_status = payload.billing_status
    school.plan_updated_at = datetime.now(timezone.utc)
    _log_activity(
        db, actor.username, "school.plan",
        f"{school.name} -> {payload.plan} ({school.billing_status})", school.id,
    )
    db.commit()
    db.refresh(school)
    return _school_out(school)


@app.post("/api/platform/schools/{school_id}/reset-password", response_model=SchoolOut)
def reset_school_password(
    school_id: int,
    payload: ResetPasswordIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    admin = db.scalar(
        select(User).where(User.school_id == school_id).where(User.role == "admin")
    )
    if not admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No admin account for this school")
    admin.password_hash = _hash_password(payload.new_password)
    _log_activity(db, actor.username, "school.password_reset", f"Reset password for {school.name}", school.id)
    db.commit()
    return _school_out(school)


# ================= Platform admin: user management =================


@app.get("/api/platform/admins")
def platform_admins(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.scalars(
        select(User)
        .where(User.role == "platform_admin")
        .order_by(User.created_at.asc())
    ).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "name": u.name,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
        }
        for u in rows
    ]


@app.post("/api/platform/admins", status_code=201)
def create_platform_admin(
    payload: PlatformAdminCreateIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")
    db.add(
        User(
            school_id=None,
            username=payload.username,
            password_hash=_hash_password(payload.password),
            role="platform_admin",
            name=payload.name,
            is_active=True,
        )
    )
    _log_activity(db, actor.username, "admin.created", f"Created admin {payload.username}")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")
    return {"ok": True}


@app.post("/api/platform/admins/{admin_id}/toggle")
def toggle_platform_admin(
    admin_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    admin = db.scalar(
        select(User).where(User.id == admin_id).where(User.role == "platform_admin")
    )
    if not admin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    if admin.username == actor.username:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot disable your own account")
    admin.is_active = not admin.is_active
    _log_activity(db, actor.username, "admin.toggled", f"{'Disabled' if not admin.is_active else 'Enabled'} {admin.username}")
    db.commit()
    return {"ok": True, "is_active": admin.is_active}


# ================= Platform admin: notifications & activity =================


@app.get("/api/platform/notifications")
def platform_notifications(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.scalars(
        select(PlatformNotice).order_by(PlatformNotice.created_at.desc()).limit(50)
    ).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "audience": n.audience,
            "school_id": n.school_id,
            "created_at": n.created_at.isoformat(),
        }
        for n in rows
    ]


@app.post("/api/platform/notifications", status_code=201)
def create_platform_notification(
    payload: PlatformNoticeIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    school_id = None
    if payload.school_id:
        school = db.scalar(select(School).where(School.id == payload.school_id))
        if not school:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
        school_id = school.id
    db.add(
        PlatformNotice(
            title=payload.title,
            body=payload.body,
            audience=payload.audience or "all",
            school_id=school_id,
        )
    )
    _log_activity(db, actor.username, "notification.created", f"{payload.title}")
    db.commit()
    return {"ok": True}


@app.delete("/api/platform/notifications/{notice_id}")
def delete_platform_notification(
    notice_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    notice = db.scalar(select(PlatformNotice).where(PlatformNotice.id == notice_id))
    if not notice:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notice not found")
    db.delete(notice)
    _log_activity(db, actor.username, "notification.deleted", f"{notice.title}")
    db.commit()
    return {"ok": True}


@app.get("/api/platform/activity")
def platform_activity(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.scalars(
        select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(100)
    ).all()
    return [
        {
            "id": a.id,
            "actor": a.actor,
            "action": a.action,
            "detail": a.detail,
            "school_id": a.school_id,
            "created_at": a.created_at.isoformat(),
        }
        for a in rows
    ]


def _seed_school_defaults(db: Session, school_id: int) -> None:
    """Idempotently seed default timetable classes and settings for a school."""
    existing = db.scalars(select(SchoolClass).where(SchoolClass.school_id == school_id)).first()
    if not existing:
        for name in ["Form 1", "Form 2", "Form 3", "Form 4"]:
            db.add(
                SchoolClass(
                    school_id=school_id,
                    name=name,
                    stream="A",
                    teacher=None,
                )
            )
    eyes = {r.key for r in db.scalars(select(AppSetting).where(AppSetting.school_id == school_id)).all()}
    year = str(datetime.now().year)
    if "academic_year" not in eyes:
        db.add(AppSetting(school_id=school_id, key="academic_year", value=f"{year} academic year"))
    if "report_title" not in eyes:
        db.add(AppSetting(school_id=school_id, key="report_title", value="School Report"))


def _school_out(s: School) -> SchoolOut:
    return SchoolOut(
        id=s.id,
        name=s.name,
        code=s.code,
        district=s.district,
        head_teacher=s.head_teacher,
        email=s.email,
        phone=s.phone,
        contact_name=s.contact_name,
        status=s.status,
        plan=s.plan,
        created_at=s.created_at,
        approved_at=s.approved_at,
    )


def _school_detail(db: Session, s: School) -> SchoolDetailOut:
    admin = db.scalar(
        select(User).where(User.school_id == s.id).where(User.role == "admin")
    )
    return SchoolDetailOut(
        id=s.id,
        name=s.name,
        code=s.code,
        district=s.district,
        head_teacher=s.head_teacher,
        email=s.email,
        phone=s.phone,
        contact_name=s.contact_name,
        status=s.status,
        plan=s.plan,
        created_at=s.created_at,
        approved_at=s.approved_at,
        billing_status=s.billing_status,
        plan_updated_at=s.plan_updated_at,
        admin={
            "id": admin.id,
            "username": admin.username,
            "name": admin.name,
            "is_active": admin.is_active,
        }
        if admin
        else None,
        student_count=db.scalar(
            select(func.count()).select_from(Student).where(Student.school_id == s.id)
        )
        or 0,
        class_count=db.scalar(
            select(func.count()).select_from(SchoolClass).where(SchoolClass.school_id == s.id)
        )
        or 0,
        report_count=db.scalar(
            select(func.count()).select_from(SchoolReport).where(SchoolReport.school_id == s.id)
        )
        or 0,
    )


def _log_activity(db: Session, actor: str, action: str, detail: str | None = None, school_id: int | None = None) -> None:
    db.add(ActivityLog(actor=actor, action=action, detail=detail, school_id=school_id))


# ================= Platform admin: operate inside a school (full CRUD) =================
# These let a platform admin view/manage any school's data directly — students,
# grades, reports, classes, notices, settings — in addition to approving and
# administering the school itself. All are guarded by require_platform_admin.


def _platform_school(db: Session, school_id: int) -> School:
    school = db.scalar(select(School).where(School.id == school_id))
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "School not found")
    return school


def _find_student(db: Session, school_id: int, student_id: str) -> Student:
    student = db.scalar(
        select(Student)
        .where(Student.school_id == school_id)
        .where(Student.student_id == student_id)
    )
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found in this school")
    return student


# --- students ---


@app.get("/api/platform/schools/{school_id}/students")
def platform_list_students(
    school_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    return _list_students(db, school_id)


@app.post("/api/platform/schools/{school_id}/students", status_code=201)
def platform_add_student(
    school_id: int,
    payload: StudentIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    student = _add_student(db, school_id, payload)
    _log_activity(db, actor.username, "school.student_added", f"Added {student.name} at school {school_id}", school_id)
    return {"student_id": student.student_id, "name": student.name, "student_class": student.student_class}


@app.post("/api/platform/schools/{school_id}/students/bulk", status_code=201)
def platform_add_students_bulk(
    school_id: int,
    payload: list[StudentIn],
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Quickly populate a school's register (e.g. when a school struggles to add learners)."""
    _platform_school(db, school_id)
    added: list[dict] = []
    errors: list[dict] = []
    for item in payload:
        try:
            st = _add_student(db, school_id, item)
            added.append({"student_id": st.student_id, "name": st.name, "student_class": st.student_class})
        except HTTPException as e:
            errors.append({"name": item.name, "error": e.detail})
            db.rollback()
    _log_activity(db, actor.username, "school.students_bulk", f"Bulk-added {len(added)} students at school {school_id}", school_id)
    db.commit()
    return {"added": added, "errors": errors}


@app.patch("/api/platform/schools/{school_id}/students/{student_id}")
def platform_update_student(
    school_id: int,
    student_id: str,
    payload: StudentIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    student = _find_student(db, school_id, student_id)
    student.name = payload.name
    student.student_class = payload.student_class.upper()
    db.commit()
    _log_activity(db, actor.username, "school.student_updated", f"Updated {student.name}", school_id)
    return {"student_id": student.student_id, "name": student.name, "student_class": student.student_class}


@app.delete("/api/platform/schools/{school_id}/students/{student_id}")
def platform_delete_student(
    school_id: int,
    student_id: str,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    student = _find_student(db, school_id, student_id)
    db.delete(student)
    db.commit()
    _log_activity(db, actor.username, "school.student_deleted", f"Deleted {student.name}", school_id)
    return {"ok": True}


# --- grades & reports ---


@app.get("/api/platform/schools/{school_id}/grades")
def platform_list_grades(
    school_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    rows = db.scalars(
        select(GradeRecord).where(GradeRecord.school_id == school_id).order_by(GradeRecord.created_at.desc())
    ).all()
    return [
        {
            "subject": g.subject,
            "student_id": g.student_id,
            "student_name": g.student_name,
            "student_class": g.student_class,
            "score": g.score,
            "grade": calc_grade_backend(g.score, g.student_class)["grade"],
            "result": calc_grade_backend(g.score, g.student_class)["result"],
            "teacher_comment": g.teacher_comment,
            "term": g.term,
            "academic_year": g.academic_year,
        }
        for g in rows
    ]


@app.post("/api/platform/schools/{school_id}/grades", status_code=201)
def platform_add_grade(
    school_id: int,
    payload: GradeIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    _add_grade(db, school_id, payload)
    db.commit()
    _log_activity(db, actor.username, "school.grade_added", f"Grade for {payload.student_id} ({payload.subject})", school_id)
    db.commit()
    return {"ok": True}


@app.delete("/api/platform/schools/{school_id}/grades/{grade_id}")
def platform_delete_grade(
    school_id: int,
    grade_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    grade = db.scalar(
        select(GradeRecord).where(GradeRecord.id == grade_id).where(GradeRecord.school_id == school_id)
    )
    if not grade:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grade not found")
    db.delete(grade)
    db.commit()
    _log_activity(db, actor.username, "school.grade_deleted", f"Deleted grade {grade.subject}", school_id)
    return {"ok": True}


@app.get("/api/platform/schools/{school_id}/reports")
def platform_reports(
    school_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    reports = db.scalars(
        select(SchoolReport)
        .where(SchoolReport.school_id == school_id)
        .order_by(SchoolReport.academic_year.desc(), SchoolReport.updated_at.desc())
    ).all()
    return [
        {
            "id": r.id,
            "student_id": r.student_id,
            "student_name": r.student_name,
            "student_class": r.student_class,
            "term": r.term,
            "academic_year": r.academic_year,
            "total_subjects": r.total_subjects,
            "average_score": r.average_score,
            "aggregate_points": r.aggregate_points,
            "position": r.position,
            "updated_at": r.updated_at.isoformat(),
        }
        for r in reports
    ]


@app.get("/api/platform/schools/{school_id}/reports/{report_id}")
def platform_report_detail(
    school_id: int,
    report_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    report = db.scalar(
        select(SchoolReport)
        .where(SchoolReport.id == report_id)
        .where(SchoolReport.school_id == school_id)
    )
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    return {
        "id": report.id,
        "student_id": report.student_id,
        "student_name": report.student_name,
        "student_class": report.student_class,
        "term": report.term,
        "academic_year": report.academic_year,
        "report_data": json.loads(report.report_data or "{}"),
    }


# --- classes ---


@app.get("/api/platform/schools/{school_id}/classes")
def platform_list_classes(
    school_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    return _classes(db, school_id)


@app.post("/api/platform/schools/{school_id}/classes", status_code=201)
def platform_add_class(
    school_id: int,
    payload: dict,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    name = (payload or {}).get("name", "").strip() or None
    stream = (payload or {}).get("stream", "") or ""
    teacher = (payload or {}).get("teacher") or None
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "name is required")
    c = SchoolClass(school_id=school_id, name=name, stream=stream, teacher=teacher)
    db.add(c)
    db.commit()
    db.refresh(c)
    _log_activity(db, actor.username, "school.class_added", f"Added class {name}", school_id)
    return {"id": c.id, "name": c.name, "stream": c.stream, "teacher": c.teacher}


@app.patch("/api/platform/schools/{school_id}/classes/{class_id}")
def platform_update_class(
    school_id: int,
    class_id: int,
    payload: dict,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    c = db.scalar(
        select(SchoolClass).where(SchoolClass.id == class_id).where(SchoolClass.school_id == school_id)
    )
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Class not found")
    data = payload or {}
    if data.get("name"):
        c.name = data["name"]
    if "stream" in data:
        c.stream = data["stream"] or ""
    if "teacher" in data:
        c.teacher = data["teacher"] or None
    db.commit()
    _log_activity(db, actor.username, "school.class_updated", f"Updated class {c.name}", school_id)
    return {"id": c.id, "name": c.name, "stream": c.stream, "teacher": c.teacher}


@app.delete("/api/platform/schools/{school_id}/classes/{class_id}")
def platform_delete_class(
    school_id: int,
    class_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    c = db.scalar(
        select(SchoolClass).where(SchoolClass.id == class_id).where(SchoolClass.school_id == school_id)
    )
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Class not found")
    db.delete(c)
    db.commit()
    _log_activity(db, actor.username, "school.class_deleted", f"Deleted class {c.name}", school_id)
    return {"ok": True}


# --- notices ---


@app.get("/api/platform/schools/{school_id}/notices")
def platform_list_notices(
    school_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    return _school_notices(db, school_id)


@app.post("/api/platform/schools/{school_id}/notices", status_code=201)
def platform_post_notice(
    school_id: int,
    payload: NoticeIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    n = _create_notice(db, school_id, payload)
    _log_activity(db, actor.username, "school.notice_posted", f"Notice '{n['title']}' at school {school_id}", school_id)
    return n


@app.delete("/api/platform/schools/{school_id}/notices/{notice_id}")
def platform_delete_notice(
    school_id: int,
    notice_id: int,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    n = db.scalar(
        select(Notice).where(Notice.id == notice_id).where(Notice.school_id == school_id)
    )
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notice not found")
    db.delete(n)
    db.commit()
    _log_activity(db, actor.username, "school.notice_deleted", f"Deleted notice '{n.title}'", school_id)
    return {"ok": True}


# --- settings ---


@app.get("/api/platform/schools/{school_id}/settings")
def platform_school_settings(
    school_id: int,
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    return _read_settings(db, school_id)


@app.put("/api/platform/schools/{school_id}/settings", response_model=SettingsOut)
def platform_save_settings(
    school_id: int,
    payload: SettingsIn,
    actor: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _platform_school(db, school_id)
    result = _save_settings(db, school_id, payload)
    _log_activity(db, actor.username, "school.settings_updated", f"Updated settings at school {school_id}", school_id)
    return result


# ================= School: Clique API surface =================


@app.get("/api/dashboard/summary")
def dashboard_summary(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    sid = user.school_id
    cfg = _read_settings(db, sid)
    students = db.scalars(
        select(Student).where(Student.school_id == sid)
    ).all()
    student_count = len(students)
    class_rows = db.scalars(select(SchoolClass).where(SchoolClass.school_id == sid)).all()
    class_count = len(class_rows) or max(len({s.student_class for s in students}), 1)

    reports = db.scalars(
        select(SchoolReport).where(SchoolReport.school_id == sid)
    ).all()
    alive = [r for r in reports if r.total_subjects > 0]
    avg = sum(r.average_score for r in alive) / len(alive) if alive else 0.0

    attendance = 91.0  # no attendance module (core pages only)
    pending = len([r for r in reports if r.total_subjects == 0])

    performance = []
    by_class = {}
    for r in alive:
        by_class.setdefault(r.student_class, []).append(r.average_score)
    for label, vals in sorted(by_class.items()):
        performance.append({"label": label.replace("FORM ", "Form "), "value": round(sum(vals) / len(vals))})

    notices = db.scalars(
        select(Notice).where(Notice.school_id == sid).order_by(Notice.date.desc()).limit(3)
    ).all()
    upcoming = [
        {
            "id": n.id,
            "title": n.title,
            "date": n.date.strftime("%d %b %Y"),
            "type": n.audience or "Notice",
        }
        for n in notices
    ]

    term, year = _current_term(db, sid)
    return {
        "schoolName": cfg.school_name or "Your School",
        "academicYear": cfg.academic_year or f"{year} academic year",
        "studentCount": student_count,
        "classCount": class_count,
        "attendanceRate": round(attendance, 1),
        "pendingReviews": pending,
        "upcomingEvents": upcoming,
        "performance": performance or [{"label": "Form 1", "value": round(avg)}],
    }


def _list_students(db: Session, sid: int):
    students = db.scalars(
        select(Student).where(Student.school_id == sid).order_by(Student.created_at.desc())
    ).all()
    reports = db.scalars(
        select(SchoolReport).where(SchoolReport.school_id == sid)
    ).all()
    latest_avg: dict[str, float] = {}
    for r in reports:
        latest_avg.setdefault(r.student_id, r.average_score)
    out = []
    for i, s in enumerate(students, start=1):
        out.append(
            {
                "id": i,
                "name": s.name,
                "admissionNumber": s.student_id,
                "className": s.student_class.replace("FORM ", "Form "),
                "status": "Active",
                "average": round(latest_avg.get(s.student_id, 0) or 0),
                "attendance": 92,
            }
        )
    return out


@app.get("/api/students")
def list_students(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    return _list_students(db, user.school_id)


def _classes(db: Session, sid: int):
    class_rows = db.scalars(
        select(SchoolClass).where(SchoolClass.school_id == sid)
    ).all()
    students = db.scalars(select(Student).where(Student.school_id == sid)).all()
    by_class: dict[str, list] = {}
    for s in students:
        by_class.setdefault(s.student_class, []).append(s)
    reports = db.scalars(select(SchoolReport).where(SchoolReport.school_id == sid)).all()

    out = []
    if not class_rows:
        for label in sorted({s.student_class for s in students}):
            row = [r for r in reports if r.student_class == label]
            out.append(
                {
                    "id": len(out) + 1,
                    "name": label.replace("FORM ", "Form "),
                    "stream": "",
                    "studentCount": len(by_class.get(label, [])),
                    "teacher": "Not assigned",
                    "average": round(sum(r.average_score for r in row) / len(row)) if row else 0,
                }
            )
        return out

    for i, c in enumerate(class_rows, start=1):
        avg_row = [r for r in reports if r.student_class == c.name.upper()]
        out.append(
            {
                "id": i,
                "name": c.name.replace("FORM ", "Form "),
                "stream": c.stream,
                "studentCount": students_in_class(students, c),
                "teacher": c.teacher or "Not assigned",
                "average": round(sum(a.average_score for a in avg_row) / len(avg_row)) if avg_row else 0,
            }
        )
    return out


@app.get("/api/classes")
def list_classes(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    return _classes(db, user.school_id)


def students_in_class(students: list, c: SchoolClass) -> int:
    return sum(1 for s in students if s.student_class == c.name.upper())


@app.get("/api/schedule")
def get_schedule(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Lidoma has no timetable; returns a sensible placeholders schedule built from classes/subjects."""
    _school_ok(db, user.school_id)
    sid = user.school_id
    class_rows = db.scalars(
        select(SchoolClass).where(SchoolClass.school_id == sid).limit(4)
    ).all()
    subjects = ["Mathematics", "English", "Physics", "Biology", "Chemistry", "Chichewa"]
    times = ["07:30 – 08:20", "08:25 – 09:15", "09:45 – 10:35", "10:40 – 11:30", "13:30 – 14:20"]
    if not class_rows:
        return []
    out = []
    for i in range(min(5, len(class_rows) * (len(times) // max(len(class_rows), 1)) + 1 if False else 5)):
        c = class_rows[i % len(class_rows)]
        out.append(
            {
                "id": i + 1,
                "time": times[i % len(times)],
                "subject": subjects[i % len(subjects)],
                "className": f"{c.name.replace('FORM ', 'Form ')} · {c.stream}".strip(" ·"),
                "room": f"Room {10 + i}",
                "status": "Upcoming",
            }
        )
    return out


def _school_notices(db: Session, sid: int):
    rows = db.scalars(
        select(Notice).where(Notice.school_id == sid).order_by(Notice.date.desc())
    ).all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "date": n.date.strftime("%d %b %Y"),
            "audience": n.audience or "All staff",
        }
        for n in rows
    ]


def _create_notice(db: Session, sid: int, payload: NoticeIn):
    n = Notice(
        school_id=sid,
        title=payload.title,
        body=payload.body,
        audience=payload.audience,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "date": n.date.strftime("%d %b %Y"),
        "audience": n.audience,
    }


@app.get("/api/notices")
def list_notices(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    return _school_notices(db, user.school_id)


@app.post("/api/notices", status_code=201)
def create_notice(
    payload: NoticeIn,
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    return _create_notice(db, user.school_id, payload)


# ================= School: management (students/grades/settings/logo) =================


def _add_student(db: Session, school_id: int, payload: StudentIn) -> Student:
    sid = payload.admission_number or gen_student_id(db, school_id, payload.student_class)
    existing = db.scalar(
        select(Student)
        .where(Student.school_id == school_id)
        .where(Student.student_id == sid)
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "A student with that admission number exists")
    student = Student(
        student_id=sid,
        school_id=school_id,
        name=payload.name,
        student_class=payload.student_class.upper(),
    )
    try:
        db.add(student)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Student already exists in this class")
    db.refresh(student)
    return student


@app.post("/api/students", status_code=201)
def add_student(
    payload: StudentIn,
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    student = _add_student(db, user.school_id, payload)
    return {"student_id": student.student_id, "name": student.name, "student_class": student.student_class}


def gen_student_id(db: Session, school_id: int, student_class: str) -> str:
    count = db.scalar(
        select(func.count()).select_from(Student).where(Student.school_id == school_id)
    ) or 0
    prefix = student_class.replace(" ", "")[:2].upper()
    return f"{prefix}-{count + 1:04d}"


def _add_grade(db: Session, school_id: int, payload: GradeIn) -> None:
    student = db.scalar(
        select(Student).where(Student.school_id == school_id).where(Student.student_id == payload.student_id)
    )
    if not student:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found in this school")
    term = payload.term or _current_term(db, school_id)[0]
    year = payload.academic_year or _current_term(db, school_id)[1]
    existing = db.scalar(
        select(GradeRecord)
        .where(GradeRecord.school_id == school_id)
        .where(GradeRecord.student_id == student.student_id)
        .where(GradeRecord.term == term)
        .where(GradeRecord.academic_year == year)
        .where(GradeRecord.subject == payload.subject)
    )
    if existing:
        existing.score = payload.score
        existing.teacher_comment = payload.teacher_comment
    else:
        db.add(
            GradeRecord(
                school_id=school_id,
                student_id=student.student_id,
                student_name=student.name,
                student_class=student.student_class,
                term=term,
                academic_year=year,
                subject=payload.subject,
                score=payload.score,
                teacher_comment=payload.teacher_comment,
            )
        )
    db.flush()
    _sync_report(db, school_id, student, term, year)


@app.post("/api/grades", status_code=201)
def add_grade(
    payload: GradeIn,
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    _add_grade(db, user.school_id, payload)
    db.commit()
    return {"ok": True}


@app.get("/api/reports")
def reports(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    return _report_summaries(db, user.school_id)


@app.get("/api/settings")
def school_settings(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    return _read_settings(db, user.school_id)


def _save_settings(db: Session, school_id: int, payload: SettingsIn) -> SettingsOut:
    data = payload.model_dump(exclude_none=True)
    for key, val in data.items():
        row = db.scalar(
            select(AppSetting)
            .where(AppSetting.school_id == school_id)
            .where(AppSetting.key == key)
        )
        if row:
            row.value = str(val)
        else:
            db.add(AppSetting(school_id=school_id, key=key, value=str(val)))
    db.commit()
    return _read_settings(db, school_id)


@app.post("/api/settings", response_model=SettingsOut)
def save_settings(
    payload: SettingsIn,
    user: Annotated[User, Depends(require_school_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    return _save_settings(db, user.school_id, payload)


@app.get("/api/logo")
def school_logo(
    user: Annotated[User, Depends(require_school_user)],
    db: Annotated[Session, Depends(get_db)],
):
    asset = db.scalar(
        select(SchoolAsset)
        .where(SchoolAsset.school_id == user.school_id)
        .where(SchoolAsset.key == "logo")
    )
    if not asset:
        return Response(status_code=204)
    return {"data_url": asset.data_url}


@app.post("/api/logo")
def save_logo(
    payload: dict,
    user: Annotated[User, Depends(require_school_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    _school_ok(db, user.school_id)
    data_url = (payload or {}).get("data_url", "")
    if not data_url or len(data_url) < 20:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "data_url is required")
    asset = db.scalar(
        select(SchoolAsset)
        .where(SchoolAsset.school_id == user.school_id)
        .where(SchoolAsset.key == "logo")
    )
    if asset:
        asset.data_url = data_url
    else:
        db.add(SchoolAsset(school_id=user.school_id, key="logo", data_url=data_url))
    db.commit()
    return {"ok": True}


@app.get("/api/me")
def me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    school = None
    if user.school_id:
        school = _school_out(db.scalar(select(School).where(School.id == user.school_id)))
    return {
        "username": user.username,
        "role": user.role,
        "name": user.name,
        "school": school,
    }


@app.on_event("startup")
def _startup():
    init_db()
    db = SessionLocal()
    try:
        existing = db.scalar(
            select(User).where(User.username == settings.platform_admin_username)
        )
        if not existing:
            db.add(
                User(
                    school_id=None,
                    username=settings.platform_admin_username,
                    password_hash=_hash_password(settings.platform_admin_password),
                    role="platform_admin",
                    is_active=True,
                )
            )
            db.commit()
    finally:
        db.close()


_serve_frontend()
