from graph.triangular_grid import TriangularGrid
from solutions_generator.solution import Solution

class StripPlanner():

    # oglišča razvrsti v vrstice
    def _sections(
        self, 
        graph: TriangularGrid
    ) -> list[list[int]]:
        n = graph.n
        return [list(range(r * (r - 1) // 2, r * (r + 1) // 2)) for r in range(1, n + 1)]
    
    # vrne rešitev sweep strip strategije za dani graf
    def plan_best(
        self,
        graph: TriangularGrid
    ) -> Solution:
        sol = self._build_solution(graph, self._sections(graph))
        self.search_status = (
            f"[strip] n={graph.n}: DOKAZANO po konstrukciji: k={sol.k} "
            f"(deterministični sweep, brez iskanja/MAX_STATES; k=n je zgornja meja)."
        )
        print(self.search_status)
        return sol

    # zgradi zaporedje premikov za strip sweep: sekcije uredi od najširše do najožje, levi začnejo čistiti najširšo vrstico in se premikajo navzgor za po eno vrstico naenkrat, znotraj vsake vrstice se premika en lev naenkrat
    def _build_solution(self, graph: TriangularGrid, sections: list[list[int]]) -> Solution:
        rows = sorted(sections, key=len, reverse=True)
        k = len(rows[0])
        initial_positions = tuple(rows[0])
        positions = list(initial_positions)
        moves = []

        for target_row in rows[1:]:
            for i, dest in enumerate(target_row):
                positions[i] = dest
                moves.append(tuple(positions))

        return Solution(n=graph.n, k=k, initial_positions=initial_positions, moves=tuple(moves))