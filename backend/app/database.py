"""SQLAlchemy engine + session factory for the complaints database (PostgreSQL)."""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass
