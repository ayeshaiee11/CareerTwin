from typing import Optional
from sqlalchemy import JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

# NOTE: the profiles and milestones tables are unchanged. The three tables added below are new, so
# Base.metadata.create_all() creates them inside your existing careertwin.db without touching old data.


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    education: Mapped[str] = mapped_column(default="")
    target_role: Mapped[str] = mapped_column(default="ML Engineer Intern")
    skills: Mapped[list] = mapped_column(JSON, default=list)
    is_demo: Mapped[bool] = mapped_column(default=False)
    milestones: Mapped[list["Milestone"]] = relationship(cascade="all, delete-orphan", order_by="Milestone.id")
    projects: Mapped[list["Project"]] = relationship(cascade="all, delete-orphan", order_by="Project.id")
    practice: Mapped[list["Practice"]] = relationship(cascade="all, delete-orphan", order_by="Practice.id")
    resume: Mapped[Optional["ResumeCheck"]] = relationship(cascade="all, delete-orphan", uselist=False)


class Milestone(Base):
    __tablename__ = "milestones"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    title: Mapped[str]
    done: Mapped[bool] = mapped_column(default=False)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    title: Mapped[str]
    url: Mapped[str] = mapped_column(default="")
    description: Mapped[str] = mapped_column(default="")
    skills: Mapped[list] = mapped_column(JSON, default=list)


class ResumeCheck(Base):
    """One saved resume + job description per profile (the inputs behind the resume alignment score)."""
    __tablename__ = "resume_checks"
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"), unique=True)
    resume_text: Mapped[str] = mapped_column(default="")
    job_description: Mapped[str] = mapped_column(default="")


class Practice(Base):
    """The user's latest answer and self-rating (1-5) for one interview question."""
    __tablename__ = "practice"
    __table_args__ = (UniqueConstraint("profile_id", "question_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("profiles.id"))
    question_id: Mapped[str]
    answer: Mapped[str] = mapped_column(default="")
    rating: Mapped[int]
