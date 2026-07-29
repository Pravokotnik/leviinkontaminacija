import math
from graph.triangular_grid import TriangularGrid
from solutions_generator.solution import Solution


# spodnja meja stevila levov za trikotnik P_n
def lower_bound_k(n: int) -> int:
    return max(1, math.ceil((n - 1) / (2 * math.sqrt(2))))


# dihedralne (D3) permutacije vozlisc za odpravo simetrij v iskanju
def build_dihedral_perms(graph: TriangularGrid) -> list[list[int]]:
    n = graph.n
    max_v = max(graph.vertices)
    bary: dict[int, tuple[int, int, int]] = {}
    for v in graph.vertices:
        r, c = graph.get_row_col(v)
        # baricentricne koordinate: a = do spodaj, b = desno, c = levo
        a = n - 1 - r
        b = r - c
        c_ = c
        bary[v] = (a, b, c_)
    inv = {abc: v for v, abc in bary.items()}

    sigmas = [
        lambda a, b, c: (a, b, c),
        lambda a, b, c: (c, a, b),
        lambda a, b, c: (b, c, a),
        lambda a, b, c: (a, c, b),
        lambda a, b, c: (b, a, c),
        lambda a, b, c: (c, b, a),
    ]

    perms: list[list[int]] = []
    for sigma in sigmas:
        perm = [0] * (max_v + 1)
        for v, (a, b, c_) in bary.items():
            a2, b2, c2 = sigma(a, b, c_)
            perm[v] = inv[(a2, b2, c2)]
        perms.append(perm)
    return perms


# preslika bitmasko skozi permutacijo vozlisc (bit v -> bit perm[v])
def permute_mask(mask: int, perm: list[int]) -> int:
    out = 0
    while mask:
        lsb = mask & -mask
        out |= 1 << perm[lsb.bit_length() - 1]
        mask ^= lsb
    return out


# skupno ogrodje iskanja: bitmaske sosedov, polna maska in dihedralne permutacije
def build_search_context(graph: TriangularGrid):
    V = graph.vertices
    nb_mask = {v: sum(1 << w for w in graph.neighbours[v]) for v in V}
    full_mask = (1 << len(V)) - 1
    return nb_mask, full_mask, build_dihedral_perms(graph)


# širjenje kontaminacije (bitmaska): vrne novo masko kontaminiranih vozlisc po enem koraku
# traversed = mnozica preckanih robov (min, max), ki blokirajo sirjenje
def spread_bitmask(cont, new_lion_mask, nb_mask, full_mask, traversed):
    new_cont = cont & ~new_lion_mask  # lev pocisti vozlisce na katerega stopi
    spread = 0
    cm = cont
    while cm:
        lsb = cm & -cm
        src = lsb.bit_length() - 1
        cm ^= lsb
        cands = nb_mask[src] & ~new_lion_mask
        while cands:
            lsb2 = cands & -cands
            dst = lsb2.bit_length() - 1
            cands ^= lsb2
            edge = (src, dst) if src < dst else (dst, src)
            if edge not in traversed:
                spread |= 1 << dst
    return (new_cont | spread) & full_mask


# rekonstruira pot od ciljnega do zacetnega stanja
# nodes[id] = (positions, ..., parent_id, ...); parent na indeksu 2, positions na 0
def reconstruct(nodes: list, goal_id: int, n: int, k: int) -> Solution:
    chain: list[tuple] = []
    cur = goal_id
    while nodes[cur][2] != -1:
        chain.append(nodes[cur][0])
        cur = nodes[cur][2]
    chain.reverse()
    init_positions = nodes[cur][0]
    return Solution(
        n=n, k=k,
        initial_positions=init_positions,
        moves=tuple(chain),
    )
