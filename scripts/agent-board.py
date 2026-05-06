#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


BOARD_PATH = Path("/Users/anvo/.codex/memories/freshlinen-agent-board.json")


def load_board() -> dict:
    raw = BOARD_PATH.read_text(encoding="utf-8")
    return json.loads(raw)


def save_board(board: dict) -> None:
    board["updated_at"] = datetime.now(timezone.utc).isoformat()
    BOARD_PATH.write_text(json.dumps(board, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def find_item(board: dict, task: str) -> tuple[str, dict] | None:
    sections = ("active", "backlog", "done")
    for section in sections:
        for item in board.get(section, []):
            if item.get("task") == task:
                return section, item
    return None


def move_item(board: dict, task: str, target_section: str, **updates: str) -> None:
    found = find_item(board, task)
    if not found:
        raise SystemExit(f"Task not found: {task}")
    source_section, item = found
    board[source_section] = [row for row in board.get(source_section, []) if row.get("task") != task]
    item.update({key: value for key, value in updates.items() if value is not None})
    board.setdefault(target_section, []).append(item)


def upsert_item(board: dict, task: str, target_section: str, **updates: str) -> None:
    found = find_item(board, task)
    if not found:
        raise SystemExit(f"Task not found: {task}")
    source_section, item = found
    if source_section != target_section:
        board[source_section] = [row for row in board.get(source_section, []) if row.get("task") != task]
        board.setdefault(target_section, []).append(item)
    item.update({key: value for key, value in updates.items() if value is not None})


def list_board(board: dict) -> None:
    print(board.get("title", "Agent Board"))
    print(board.get("subtitle", ""))
    print()
    for section in ("active", "backlog", "done"):
        print(section.upper())
        for item in board.get(section, []):
            owner = item.get("owner", "Unassigned")
            status = item.get("status", "")
            branch = item.get("branch", "")
            print(f"- {item.get('task')} [{owner}] {status} {branch}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list")

    add = sub.add_parser("add")
    add.add_argument("--section", choices=["active", "backlog", "done"], default="backlog")
    add.add_argument("--task", required=True)
    add.add_argument("--owner", default="Unassigned")
    add.add_argument("--branch", default="")
    add.add_argument("--status", default="Backlog")
    add.add_argument("--notes", default="")
    add.add_argument("--commit", default="")

    move = sub.add_parser("move")
    move.add_argument("--task", required=True)
    move.add_argument("--section", choices=["active", "backlog", "done"], required=True)
    move.add_argument("--owner", default=None)
    move.add_argument("--branch", default=None)
    move.add_argument("--status", default=None)
    move.add_argument("--notes", default=None)
    move.add_argument("--commit", default=None)

    claim = sub.add_parser("claim")
    claim.add_argument("--task", required=True)
    claim.add_argument("--owner", required=True)
    claim.add_argument("--branch", required=True)
    claim.add_argument("--notes", default=None)

    ready = sub.add_parser("ready")
    ready.add_argument("--task", required=True)
    ready.add_argument("--commit", required=False)
    ready.add_argument("--notes", default=None)

    done = sub.add_parser("done")
    done.add_argument("--task", required=True)
    done.add_argument("--commit", required=False)
    done.add_argument("--notes", default=None)

    touch = sub.add_parser("touch")
    touch.add_argument("--task", required=True)
    touch.add_argument("--owner", default=None)
    touch.add_argument("--branch", default=None)
    touch.add_argument("--status", default=None)
    touch.add_argument("--notes", default=None)
    touch.add_argument("--commit", default=None)

    args = parser.parse_args()
    board = load_board()

    if args.command == "list":
        list_board(board)
        return

    if args.command == "add":
        board.setdefault(args.section, []).append(
            {
                "task": args.task,
                "owner": args.owner,
                "branch": args.branch,
                "status": args.status,
                "notes": args.notes,
                "commit": args.commit or "",
            }
        )
        save_board(board)
        return

    if args.command == "move":
        move_item(
            board,
            args.task,
            args.section,
            owner=args.owner,
            branch=args.branch,
            status=args.status,
            notes=args.notes,
            commit=args.commit,
        )
        save_board(board)
        return

    if args.command == "claim":
        upsert_item(
            board,
            args.task,
            "active",
            owner=args.owner,
            branch=args.branch,
            status="In Progress",
            notes=args.notes,
        )
        save_board(board)
        print(f"Claimed: {args.task}")
        return

    if args.command == "ready":
        upsert_item(
            board,
            args.task,
            "active",
            status="Ready to Push",
            commit=args.commit,
            notes=args.notes,
        )
        save_board(board)
        print(f"Ready to push: {args.task}")
        return

    if args.command == "done":
        move_item(
            board,
            args.task,
            "done",
            status="Done",
            commit=args.commit,
            notes=args.notes,
        )
        save_board(board)
        print(f"Done: {args.task}")
        return

    if args.command == "touch":
        found = find_item(board, args.task)
        if not found:
            raise SystemExit(f"Task not found: {args.task}")
        section, item = found
        item.update({key: value for key, value in {
            "owner": args.owner,
            "branch": args.branch,
            "status": args.status,
            "notes": args.notes,
            "commit": args.commit,
        }.items() if value is not None})
        save_board(board)
        print(f"Updated {section}: {args.task}")
        return


if __name__ == "__main__":
    main()
