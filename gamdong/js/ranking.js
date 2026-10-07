// 참가자 정렬·순위 계산 (공동 순위 처리: 1, 1, 3 ...)
window.GDRank = {
  ordered(contestants) {
    return Object.entries(contestants || {})
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
  },
  ranked(contestants, rankBy) {
    const list = this.ordered(contestants)
      .filter((c) => typeof c.result === "number")
      .map((c) => {
        const base = Math.max(c.base || 0, c.result);
        return { ...c, base, ratio: base ? c.result / base : 0 };
      });
    const key = (c) => (rankBy === "ratio" ? c.ratio : c.result);
    list.sort((a, b) => key(b) - key(a) || b.result - a.result);
    list.forEach((c, i) => {
      c.rank = i > 0 && key(c) === key(list[i - 1]) && c.result === list[i - 1].result ? list[i - 1].rank : i + 1;
    });
    return list;
  },
  rankOf(contestants, id, rankBy) {
    const r = this.ranked(contestants, rankBy).find((c) => c.id === id);
    return r ? r.rank : null;
  }
};
