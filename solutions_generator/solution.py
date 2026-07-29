from dataclasses import dataclass

@dataclass(frozen=True)
class Solution:
    # velikost trikotniške mreže
    n: int
    # število levov
    k: int
    # začetne pozicije levov
    initial_positions: tuple[int, ...]
    # premiki levov v posameznem časovnem koraku: moves[t] = pozicije vseh k levov v časovnem koraku t
    moves: tuple[tuple[int, ...], ...]
