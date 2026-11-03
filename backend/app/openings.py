"""Opening classification + browsing, built from the lichess-org/chess-openings
dataset (MIT licensed, bundled in backend/data/{a,b,c,d,e}.tsv).

We build a trie keyed by UCI move so that:
  - classify(moves) can find the deepest known opening name for a game
    (used by the analyzer for "Book" moves, and by the opponent scout to
    label games by opening).
  - the trainer/browsing UI can walk the tree move-by-move without us
    re-parsing PGN text on every request.
  - a named opening (eco + name) can be turned back into its move list, so
    "add this to my repertoire" from the opponent scout actually works.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import chess

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass
class OpeningNode:
    move_uci: Optional[str] = None          # the move that leads INTO this node (None for root)
    san: Optional[str] = None
    eco: Optional[str] = None
    name: Optional[str] = None
    children: Dict[str, "OpeningNode"] = field(default_factory=dict)

    def to_dict(self, include_children: bool = True) -> dict:
        d = {
            "move": self.move_uci,
            "san": self.san,
            "eco": self.eco,
            "name": self.name,
        }
        if include_children:
            d["children"] = [c.to_dict(include_children=False) for c in self.children.values()]
        return d


class OpeningBook:
    def __init__(self):
        self.root = OpeningNode()
        self._by_eco: Dict[str, List[OpeningNode]] = {}
        self._all_named: List[OpeningNode] = []
        self._moves_by_key: Dict[str, List[str]] = {}   # "ECO|Name" -> [uci, uci, ...]
        self._load()

    def _load(self):
        for letter in "abcde":
            path = DATA_DIR / f"{letter}.tsv"
            if not path.exists():
                continue
            with open(path, encoding="utf-8") as f:
                f.readline()  # header
                for line in f:
                    line = line.rstrip("\n")
                    if not line:
                        continue
                    eco, name, pgn = line.split("\t", 2)
                    self._insert(eco, name, pgn)

    def _insert(self, eco: str, name: str, pgn_moves: str):
        board = chess.Board()
        node = self.root
        uci_moves: List[str] = []
        # pgn field looks like "1. e4 e5 2. Nf3 Nc6 3. Bb5"
        for token in pgn_moves.split():
            if token.endswith("."):
                continue  # move-number token like "12."
            try:
                move = board.parse_san(token)
            except ValueError:
                return  # malformed line; skip rest
            uci = move.uci()
            san = board.san(move)
            board.push(move)
            uci_moves.append(uci)
            if uci not in node.children:
                node.children[uci] = OpeningNode(move_uci=uci, san=san)
            node = node.children[uci]
        node.eco = eco
        node.name = name
        self._all_named.append(node)
        self._by_eco.setdefault(eco, []).append(node)
        self._moves_by_key[f"{eco}|{name}"] = uci_moves

    def classify(self, uci_moves: List[str]) -> Optional[dict]:
        """Walk a game's moves and return the deepest {eco, name, ply} match."""
        node = self.root
        best: Optional[OpeningNode] = None
        best_ply = 0
        for i, uci in enumerate(uci_moves):
            if uci not in node.children:
                break
            node = node.children[uci]
            if node.name:
                best = node
                best_ply = i + 1
        if best is None:
            return None
        return {"eco": best.eco, "name": best.name, "ply": best_ply}

    def node_at(self, uci_moves: List[str]) -> Optional[OpeningNode]:
        node = self.root
        for uci in uci_moves:
            if uci not in node.children:
                return None
            node = node.children[uci]
        return node

    def moves_for(self, eco: str, name: str) -> Optional[List[str]]:
        return self._moves_by_key.get(f"{eco}|{name}")

    def search(self, query: str, limit: int = 25) -> List[dict]:
        q = query.lower().strip()
        if not q:
            return []
        out = []
        for node in self._all_named:
            if node.name and q in node.name.lower():
                out.append({"eco": node.eco, "name": node.name})
                if len(out) >= limit:
                    break
        return out


_book: Optional[OpeningBook] = None


def get_book() -> OpeningBook:
    global _book
    if _book is None:
        _book = OpeningBook()
    return _book
