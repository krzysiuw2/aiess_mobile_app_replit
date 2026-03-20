from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable


def compute_easter(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    month = (h + ell - 7 * m + 114) // 31
    day = ((h + ell - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def get_polish_holidays(year: int) -> list[date]:
    easter = compute_easter(year)
    fixed = [
        date(year, 1, 1),
        date(year, 1, 6),
        date(year, 5, 1),
        date(year, 5, 3),
        date(year, 8, 15),
        date(year, 11, 1),
        date(year, 11, 11),
        date(year, 12, 25),
        date(year, 12, 26),
    ]
    movable = [
        easter,
        easter + timedelta(days=1),
        easter + timedelta(days=49),
        easter + timedelta(days=60),
    ]
    out = sorted(set(fixed + movable))
    return out


def is_holiday(d: date) -> bool:
    return d in get_polish_holidays(d.year)


def _next_calendar_weekday(d: date) -> date:
    n = d + timedelta(days=1)
    while n.weekday() >= 5:
        n += timedelta(days=1)
    return n


def is_pre_holiday(d: date) -> bool:
    return is_holiday(_next_calendar_weekday(d))


def multi_day_holiday_streak_at(d: date) -> int:
    """Length of the maximal consecutive run of public holidays containing d (calendar days)."""
    y = d.year
    hol = set(get_polish_holidays(y))
    if d not in hol:
        return 0
    lo = d
    while lo - timedelta(days=1) in hol:
        lo -= timedelta(days=1)
    hi = d
    while hi + timedelta(days=1) in hol:
        hi += timedelta(days=1)
    return (hi - lo).days + 1


def iter_holiday_adjacent_days(d: date) -> Iterable[date]:
    for delta in (-1, 0, 1):
        yield d + timedelta(days=delta)
