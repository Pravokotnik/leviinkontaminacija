from graph.triangular_grid import TriangularGrid

class GraphState:
    def __init__(self, graph: TriangularGrid, lion_positions: list[int]):
        self.graph = graph
        self.lion_positions: list[int] = list(lion_positions)
        # vsa oglišča, ki niso zasedena z levi, so kontaminirana
        self.contaminated: set[int] = (
            set(graph.vertices) - set(lion_positions)
        )