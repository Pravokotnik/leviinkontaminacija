from collections import deque
from graph.triangular_grid import TriangularGrid
from solutions_generator.solution import Solution

# Zgornja meja števila stanj v BFS pred razglasitvijo neuspeha.
MAX_STATES = 1_000_000


class MonotonePlanner():

    def plan(
        self,
        graph: TriangularGrid,
        k: int,
    ) -> Solution | None:
        return self._search(graph, k)

    def _search(self, graph: TriangularGrid, k: int) -> Solution | None:
        # true == če presežemo MAX_STATES, false == uspeh BFS 
        self._capped = False

        # spodnjih k vozlisc (zacetna pozicija)
        vertices_desc = sorted(graph.vertices, reverse=True)
        all_vertices = frozenset(graph.vertices)
        adj = graph.neighbours

        parent: dict = {} # za vsako stanje hrani od kod in s katero potezo pridemo do njega
        init_map: dict = {}
        queue: deque = deque() # stanja za BFS: (frozenset trenutnih pozicij levov, frozenset kontaminiranih vozlišč)

        init = tuple(sorted(vertices_desc[:k])) # zacetna pozicija levov
        contaminated = frozenset(all_vertices - frozenset(init))
        if not contaminated:
            return Solution(n=graph.n, k=k, initial_positions=init, moves=())
        
        key = (frozenset(init), contaminated)
        parent[key] = None
        init_map[key] = init
        queue.append(key)

        while queue:
            if len(parent) > MAX_STATES:
                self._capped = True
                return None

            pos_set, contaminated = queue.popleft() # naslednje stanje (najstarejse)

            for v in pos_set:
                # vsakeaga leva premaknemo na sosednje vozlišče
                for nb in adj[v]:

                    new_pos_set = (pos_set - {v}) | {nb}

                    # preverimo monotono omejitev
                    new_contaminated = self._simulate_monotone(
                        graph, contaminated, v, nb, new_pos_set, all_vertices
                    )
                    if new_contaminated is None:
                        continue  # monotona omejitev kršena

                    new_key = (new_pos_set, new_contaminated)
                    # hranimo novo stanje ter kako smo prisli do njega
                    if new_key not in parent:
                        parent[new_key] = ((pos_set, contaminated), v, nb)
                        # ni vec kontaminacije - konec
                        if not new_contaminated:
                            moves, init_pos = self._reconstruct_path(
                                parent, new_key, init_map
                            )
                            return Solution(
                                n=graph.n,
                                k=k,
                                initial_positions=init_pos,
                                moves=tuple(moves),
                            )

                        queue.append(new_key)

        return None

    def _simulate_monotone(
        self,
        graph: TriangularGrid,
        contaminated: frozenset,
        old_v: int,
        new_v: int,
        new_pos_set: frozenset,
        all_vertices: frozenset,
    ) -> frozenset | None:

        clean_before = all_vertices - contaminated

        # rob ki ga lev precka blokira sirjenje kontaminacije
        edge = (min(old_v, new_v), max(old_v, new_v))

        # lev ocisti vozlisce
        new_contaminated = contaminated - {new_v}

        # sirjenje kontaminacije na prej cista vozlišča
        extra: set = set()
        for u in graph.vertices:
            if u not in new_pos_set and u in clean_before:
                for nb in graph.neighbours[u]:
                    if nb in contaminated and (min(u, nb), max(u, nb)) != edge:
                        extra.add(u)
                        break

        # monotona omejitev - ne sme se pojaviti ponovna kontaminacija
        if extra:
            return None

        return frozenset(new_contaminated)

    def _reconstruct_path(
        self,
        parent: dict,
        goal_key: tuple,
        init_map: dict,
    ) -> tuple[list[tuple], tuple]:
    
        changes: list[tuple[int, int]] = []
        key = goal_key
        while parent[key] is not None:
            pk, old_v, new_v = parent[key]
            changes.append((old_v, new_v))
            key = pk
        changes.reverse()  # od zacetka do cilja

        init_pos = init_map[key]
        positions = list(init_pos)
        moves: list[tuple] = []
        for old_v, new_v in changes:
            idx = positions.index(old_v)
            positions[idx] = new_v
            moves.append(tuple(positions))

        return moves, init_pos
