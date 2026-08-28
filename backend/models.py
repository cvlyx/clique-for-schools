from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class School(Base):
    """A registered school / tenant. Status gates whether it can access the system."""

    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    head_teacher: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # provisional -> active (approved) | rejected | suspended
    status: Mapped[str] = mapped_column(String(24), default="provisional", index=True)
    plan: Mapped[str | None] = mapped_column(String(64), nullable=True)
    billing_status: Mapped[str] = mapped_column(String(24), default="free")
    plan_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Platform admins have school_id = None; school users point at their school.
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # platform_admin | admin | teacher | parent
    role: Mapped[str] = mapped_column(String(24), default="teacher")
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("school_id", "name", "student_class", name="uq_student_school_name_class"),
    )

    student_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), index=True)
    student_class: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GradeRecord(Base):
    __tablename__ = "grade_records"
    __table_args__ = (
        UniqueConstraint(
            "school_id", "student_id", "term", "academic_year", "subject",
            name="uq_grade_school_stu_term_year_subj",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[str] = mapped_column(String(32), index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    student_class: Mapped[str] = mapped_column(String(32))
    term: Mapped[str] = mapped_column(String(32), index=True)
    academic_year: Mapped[str] = mapped_column(String(32), index=True)
    subject: Mapped[str] = mapped_column(String(64), index=True)
    score: Mapped[int] = mapped_column(Integer)
    teacher_comment: Mapped[str | None] = mapped_column(String(240), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SchoolReport(Base):
    __tablename__ = "school_reports"
    __table_args__ = (
        UniqueConstraint(
            "school_id", "student_id", "term", "academic_year",
            name="uq_report_school_stu_term_year",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    student_id: Mapped[str] = mapped_column(String(32), index=True)
    student_name: Mapped[str] = mapped_column(String(120), index=True)
    student_class: Mapped[str] = mapped_column(String(32), index=True)
    term: Mapped[str] = mapped_column(String(32), index=True)
    academic_year: Mapped[str] = mapped_column(String(32), index=True)
    total_subjects: Mapped[int] = mapped_column(Integer, default=0)
    average_score: Mapped[float] = mapped_column(Float, default=0.0)
    aggregate_points: Mapped[float] = mapped_column(Float, default=0.0)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    report_data: Mapped[str] = mapped_column(Text, default="{}")
    pdf_data: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"
    __table_args__ = (UniqueConstraint("school_id", "key", name="uq_setting_school_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(64))
    value: Mapped[str] = mapped_column(Text())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SchoolAsset(Base):
    __tablename__ = "school_assets"
    __table_args__ = (UniqueConstraint("school_id", "key", name="uq_asset_school_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(64))
    data_url: Mapped[str] = mapped_column(Text())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SchoolClass(Base):
    """A class/stream for the Clique Classes screen, scoped per school."""

    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(64))
    stream: Mapped[str] = mapped_column(String(64), default="")
    teacher: Mapped[str | None] = mapped_column(String(120), nullable=True)


class Notice(Base):
    """School notices, scoped per school."""

    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text())
    audience: Mapped[str | None] = mapped_column(String(64), default="All staff")
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ActivityLog(Base):
    """Audit / activity trail for platform-level actions."""

    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    school_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PlatformNotice(Base):
    """Notices the platform sends to one or all schools."""

    __tablename__ = "platform_notices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text())
    audience: Mapped[str] = mapped_column(String(24), default="all")
    school_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
