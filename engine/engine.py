"""Shared rules: move → clean → spread."""
from __future__ import annotations
from graph.triangular_grid import TriangularGrid
from graph.graph_state import GraphState
from engine.run_result import RunResult


class Engine:
    def __init__(
        self, 
        graph: TriangularGrid, 
        state: GraphState,
        strategy, 
        strategy_name: str
    ):
        self.graph = graph
        self.state = state
        self.strategy = strategy
        self.strategy_name = strategy_name
        self.t = 0

    # en časoven premik
    def step(
        self
    ) -> GraphState:
        state = self.state
        t = self.t

        # dobimo nove pozicije levov iz strategije
        new_positions = self.strategy.next_moves(t)

        # validacija premika glede na strategijo
        self._validate(state, new_positions)

        # oglišča, ki so bila kontaminirana pred premikom
        contaminated_before = frozenset(state.contaminated)

        # oglišča, čez katere so levi prečkali (blokirajo širjenje kontaminacije)
        old_positions = state.lion_positions
        traversed: set[tuple[int, int]] = set()
        for old, new in zip(old_positions, new_positions):
            if old != new:
                traversed.add((min(old, new), max(old, new)))

        # premik levov
        state.lion_positions = list(new_positions)

        # oglišča, na katera so se premaknili levi, postanejo čista
        lion_set = set(new_positions)
        state.contaminated -= lion_set

        # širjenje kontaminacije
        newly_contaminated = set()
        for v in state.graph.vertices:
            if v not in lion_set and v not in contaminated_before:
                for nb in state.graph.get_neighbours(v):
                    if nb in contaminated_before:
                        edge = (min(v, nb), max(v, nb))
                        if edge not in traversed:
                            newly_contaminated.add(v)
                            break
        state.contaminated.update(newly_contaminated)

        self.t += 1
        return state

    def _validate(
        self, 
        state: GraphState, 
        new_positions: list[int]
    ):
        name = self.strategy_name
        k = len(state.lion_positions)
        if len(new_positions) != k:
            raise ValueError(f"Pričakovano {k} pozicij, imam {len(new_positions)}")
        

        # preveri, da so vse pozicije veljavna oglišča
        vertex_set = set(self.graph.vertices)
        for v in new_positions:
            if v not in vertex_set:
                raise ValueError(f"Oglišče {v} ni v grafu")

        if name == 'polite':
            # lahko se premakne samo en lev
            moves_count = sum(
                1 for old, new in zip(state.lion_positions, new_positions)
                if old != new
            )
            if moves_count > 1:
                raise ValueError(
                    f"Kršena vljudna omejitev: {moves_count} premikov (dovoljeno največ 1)"
                )

        elif name == 'caffeinated':
            # premakniti se mora vsak lev
            for i, (old, new) in enumerate(zip(state.lion_positions, new_positions)):
                if old == new:
                    raise ValueError(
                        f"Kršena kofeinirana omejitev: lev {i} se ni premaknil"
                    )

    # poganjamo, dokler ni graf očiščen ali dokler ne zmanjka strategije
    def run(self) -> RunResult:
        solution = self.strategy.solution
        total_steps = len(solution.moves)

        while self.t < total_steps:
            self.step()
            if not self.state.contaminated:
                return RunResult(
                    strategy_name=self.strategy_name,
                    n=self.graph.n,
                    k=len(self.state.lion_positions),
                    steps=self.t,
                    success=True,
                    solution=solution,
                )

        return RunResult(
            strategy_name=self.strategy_name,
            n=self.graph.n,
            k=len(self.state.lion_positions),
            steps=self.t,
            success=False,
            solution=solution,
        )
