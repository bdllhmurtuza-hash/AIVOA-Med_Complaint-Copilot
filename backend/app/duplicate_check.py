"""
Duplicate complaint detection (bonus feature).

After the agent parses a new complaint, compare product_name + batch_number
against previously COMMITTED complaints in PostgreSQL. If a close match exists,
return a warning note to append to the copilot's reply.

No embeddings / vector search — just direct field matching per time constraint.
Only queries the complaints table; never creates rows during parsing.
"""

from __future__ import annotations

from sqlalchemy import text
from app.database import SessionLocal


def check_for_duplicates(
    product_name: str | None,
    batch_number: str | None,
) -> list[dict]:
    """
    Query the PostgreSQL complaints table for rows matching product_name AND batch_number.
    Returns a list of dicts with id, customer_name, committed_at for each match.
    Only matches against previously COMMITTED complaints (rows in the table).
    """
    if not product_name or not batch_number:
        return []

    db = SessionLocal()
    try:
        result = db.execute(
            text(
                "SELECT id, customer_name, committed_at "
                "FROM complaints "
                "WHERE product_name = :pname AND batch_number = :batch "
                "ORDER BY committed_at DESC"
            ),
            {"pname": product_name, "batch": batch_number},
        )
        rows = result.fetchall()
        return [
            {
                "id": row[0],
                "customer_name": row[1],
                "committed_at": row[2].strftime("%Y-%m-%d %H:%M") if row[2] else "unknown",
            }
            for row in rows
        ]
    finally:
        db.close()


def format_duplicate_note(matches: list[dict]) -> str:
    """
    Build a human-readable duplicate warning from match results.
    """
    if not matches:
        return ""

    lines = []
    for m in matches:
        lines.append(
            f"  • Complaint #{m['id']} from {m['customer_name']} "
            f"committed on {m['committed_at']}"
        )

    header = (
        f"\n\n⚠️ Duplicate detected — found {len(matches)} existing complaint(s) "
        f"with the same product and batch:\n"
    )
    return header + "\n".join(lines)


def check_and_append_note(reply: str, fields: dict) -> str:
    """
    Convenience wrapper: check duplicates using the current fields,
    and if matches found, append a note to the copilot reply.
    Returns the (possibly amended) reply string.

    This function is READ-ONLY — it only queries the database,
    never creates or modifies any rows.
    """
    matches = check_for_duplicates(
        product_name=fields.get("product_name"),
        batch_number=fields.get("batch_number"),
    )
    note = format_duplicate_note(matches)
    if note:
        return reply + note
    return reply
