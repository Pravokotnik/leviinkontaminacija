from __future__ import annotations
from collections import deque
from itertools import combinations_with_replacement
from graph.triangular_grid import TriangularGrid
from solutions_generator.solution import Solution
from solutions_generator.search_utils import build_search_context, permute_mask, reconstruct, spread_bitmask


# max stevilo edinstvenih stanj ki jih lahko dosezemo
MAX_STATES = 20_000_000


class PolitePlanner:

    def plan(self, graph: TriangularGrid, k: int) -> Solution | None:
        sol = self._bfs(graph, k)
        if sol is not None:
            self.search_status = (
                f"[polite] n={graph.n}: k={k} FEASIBLE."
            )
        elif self._capped:
            self.search_status = (
                f"[polite] n={graph.n}: k={k} NEDOLOČENO -- zadel "
                f"MAX_STATES (ni dokazano neizvedljivo)."
            )
        else:
            self.search_status = (
                f"[polite] n={graph.n}: k={k} dokazano neizvedljiv "
                f"(naravno izčrpano)."
            )
        return sol

    def _bfs(self, graph: TriangularGrid, k: int) -> Solution | None:

        self._capped = False

        NV = len(graph.vertices)
        if k > NV:
            return None

        adj = [tuple(sorted(graph.neighbours[v])) for v in range(NV)]
        # skupno ogrodje: bitmaske sosedov, polna maska, dihedralne permutacije
        nb_mask, full_mask, perms = build_search_context(graph)

        def canonical(positions: tuple, cont: int) -> tuple:
            # iz trenutnega stanja levov in kontaminacije vrnemo leksikografsko najmanjso sliko tega stanja
            best = None
            for perm in perms:
                ml_tuple = tuple(sorted(perm[v] for v in positions))
                mc = permute_mask(cont, perm)
                key = (ml_tuple, mc)
                if best is None or key < best:
                    best = key
            return best

        # sezbnam vseh stanj
        nodes: list[tuple] = []
        # obiskano + cena -> g_best[canonical(positions, cont)] = najmanjse st korakov do tja
        g_best: dict = {}
        queue: deque = deque()

        # vse zacetne kombinacije
        for comb in combinations_with_replacement(range(NV), k):
            # izracunamo zacetne pozicije levov in kontaminacije
            init_positions = tuple(comb)
            lion = 0
            for v in init_positions:
                lion |= 1 << v
            cont = full_mask & ~lion

            if cont == 0:
                return Solution(
                    n=graph.n, k=k,
                    initial_positions=init_positions,
                    moves=(),
                )
            
            key = canonical(init_positions, cont)
            # ce kljuc ze imamo, preskocimo
            if key in g_best:
                continue
                
            g_best[key] = 0
            node_id = len(nodes)
            # vozlisce: (pozicije, kontaminacija, stars, premaknjen lev, cena g)
            nodes.append((init_positions, cont, -1, -1, 0))
            queue.append(node_id)

        # BFS
        while queue:
            if len(g_best) > MAX_STATES:
                self._capped = True
                return None

            node_id = queue.popleft()
            positions, cont = nodes[node_id][0], nodes[node_id][1]

            # cena trenutnega stanja (shranjena ob dodajanju vozlisca; ocisceno
            # stanje se v vrsto nikoli ne doda -- vrne se ze ob generiranju)
            cur_g = nodes[node_id][4]
            # premik 1 leva naenkrat
            for i in range(k):
                old_v = positions[i]
                for w in adj[old_v]:
                    # dobimo nove pozicije levov
                    new_positions = positions[:i] + (w,) + positions[i + 1:]
                    new_lion_mask = 0
                    for v in new_positions:
                        new_lion_mask |= 1 << v

                    # preckani rob blokira sirjenje (premakne se le en lev)
                    edge = (old_v, w) if old_v < w else (w, old_v)
                    new_cont = spread_bitmask(
                        cont, new_lion_mask, nb_mask, full_mask, {edge}
                    )

                    key = canonical(new_positions, new_cont)
                    # ce je stanje ze obiskano se ga preskoci (pri bfs ne bo manjse cene)
                    if key in g_best:
                        continue
                    g_best[key] = cur_g + 1

                    new_id = len(nodes)
                    nodes.append((new_positions, new_cont, node_id, i, cur_g + 1))

                    if new_cont == 0:
                        return reconstruct(nodes, new_id, graph.n, k)

                    queue.append(new_id)

        return None