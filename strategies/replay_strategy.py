# predvaja shranjeno rešitev: vrne pozicije levov v koraku t
class ReplayStrategy:
    def __init__(self, solution):
        self.solution = solution

    def next_moves(self, t):
        return list(self.solution.moves[t])
