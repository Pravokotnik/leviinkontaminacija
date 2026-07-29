class TriangularGrid:
    def __init__(self, n: int):
        self.n = n
        self.vertices: list[int] = []
        self.neighbours: dict[int, list[int]] = {}
        self._row_col: dict[int, tuple[int, int]] = {}
        self._build()

    def _build(self):
        self._build_vertices(self.n)
        self._build_neighbours(self.n)

    # vertex id za dani row in col
    def _vertex_id(self, row: int, col: int) -> int:
        return row * (row + 1) // 2 + col

    def _build_vertices(self, n: int):
        # zgradi oglišča (vertices)
        for row in range(n):
            for col in range(row + 1):
                curr = self._vertex_id(row, col)
                self.vertices.append(curr)
                self._row_col[curr] = (row, col)
                self.neighbours[curr] = []

    def _candidate_positions(self, row: int, col: int) -> list[tuple[int, int]]:
        return [
            (row, col - 1),
            (row, col + 1),
            (row - 1, col - 1),
            (row - 1, col),
            (row + 1, col),
            (row + 1, col + 1),
        ]

    def _is_valid_position(self, row: int, col: int, n: int) -> bool:
        return 0 <= row < n and 0 <= col <= row

    def _build_neighbours(self, n: int):
        # zgradi sosednje sezname (neighbour lists)
        for row in range(n):
            for col in range(row + 1):
                curr = self._vertex_id(row, col)
                for r2, c2 in self._candidate_positions(row, col):
                    if self._is_valid_position(r2, c2, n):
                        nb = self._vertex_id(r2, c2)
                        self.neighbours[curr].append(nb)

        # sortiramo sosede
        for curr in self.vertices:
            self.neighbours[curr].sort()

    def get_neighbours(self, curr: int) -> list[int]:
        return self.neighbours[curr]

    def get_row_col(self, curr: int) -> tuple[int, int]:
        return self._row_col[curr]