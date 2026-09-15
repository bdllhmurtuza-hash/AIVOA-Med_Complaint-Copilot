"""SQLAlchemy models — matches SPEC.md section 4 complaint schema."""

from datetime import datetime
from sqlalchemy import Column, Integer, Text, DateTime
from app.database import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Text)
    complaint_source = Column(Text)
    customer_name = Column(Text)
    product_name = Column(Text)
    product_strength = Column(Text)
    batch_number = Column(Text)
    affected_quantity = Column(Text)
    manufacturing_date = Column(Text)
    expiry_date = Column(Text)
    originating_site = Column(Text)
    impacted_npm = Column(Text)
    complaint_category = Column(Text)
    complaint_description = Column(Text)
    risk_severity = Column(Text)
    suggested_next_action = Column(Text)
    initial_risk_assessment = Column(Text)
    committed_at = Column(DateTime, default=datetime.utcnow)
