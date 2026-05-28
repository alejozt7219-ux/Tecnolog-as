"""
tests/test_filter.py
Pruebas unitarias para app/scraper/filter.py

Corre con:  pytest tests/test_filter.py -v
"""

import pytest
from app.scraper.filter import is_relevant, filter_results, FilterResult


# ─────────────────────────────────────────────────────────────────
# FIX #1 — Series X vs Series S
# ─────────────────────────────────────────────────────────────────

class TestModelVariant:
    def test_series_x_accepts_series_x(self):
        r = is_relevant("Xbox Series X", "Microsoft Xbox Series X 1TB Consola")
        assert r.passed

    def test_series_x_rejects_series_s(self):
        r = is_relevant("Xbox Series X", "Microsoft Xbox Series S 512GB Consola")
        assert not r.passed
        assert r.reason == "model_variant"

    def test_series_s_accepts_series_s(self):
        r = is_relevant("Xbox Series S", "Consola Xbox Series S 512GB")
        assert r.passed

    def test_series_s_rejects_series_x(self):
        r = is_relevant("Xbox Series S", "Consola Xbox Series X 1TB")
        assert not r.passed

    def test_no_variant_in_query_is_lenient(self):
        # Si la query no especifica variante, no rechazar por variante
        r = is_relevant("Xbox consola", "Xbox Series X 1TB")
        assert r.passed

    def test_iphone_15_rejects_iphone_16(self):
        r = is_relevant("iPhone 15 Pro", "Apple iPhone 16 Pro 256GB")
        assert not r.passed
        assert r.reason == "model_variant"


# ─────────────────────────────────────────────────────────────────
# FIX #2 — Accesorios
# ─────────────────────────────────────────────────────────────────

class TestAccessoryFilter:
    def test_control_rejected_for_xbox_query(self):
        r = is_relevant("Xbox Series X", "Control Xbox Series X inalámbrico negro")
        assert not r.passed
        assert r.reason == "accessory"

    def test_headset_rejected_for_xbox_query(self):
        r = is_relevant("Xbox Series X", "Headset inalámbrico Xbox Series X")
        assert not r.passed
        assert r.reason == "accessory"

    def test_console_accepted_for_xbox_query(self):
        r = is_relevant("Xbox Series X", "Consola Microsoft Xbox Series X 1TB SSD")
        assert r.passed

    def test_accessory_accepted_when_query_is_accessory(self):
        # Si la query pide un control, no bloquear
        r = is_relevant("Control Xbox Series X", "Control Xbox Series X inalámbrico")
        assert r.passed

    def test_laptop_query_rejects_mouse(self):
        r = is_relevant("Laptop Lenovo IdeaPad", "Mouse inalámbrico Lenovo")
        assert not r.passed

    def test_laptop_query_accepts_laptop(self):
        r = is_relevant("Laptop Lenovo IdeaPad", "Lenovo IdeaPad 3 15 Intel Core i5")
        assert r.passed


# ─────────────────────────────────────────────────────────────────
# FIX #3 — Patrocinados
# ─────────────────────────────────────────────────────────────────

class TestSponsoredFilter:
    def test_sponsored_always_rejected(self):
        r = is_relevant(
            "Xbox Series X",
            "Consola Xbox Series X 1TB",
            sponsored=True,
        )
        assert not r.passed
        assert r.reason == "sponsored"

    def test_sponsored_even_if_title_matches(self):
        # Aunque sea un producto perfectamente relevante, si es sponsored → fuera
        r = is_relevant(
            "Xbox Series X",
            "Microsoft Xbox Series X 1TB Consola Negra",
            sponsored=True,
        )
        assert not r.passed

    def test_non_sponsored_passes(self):
        r = is_relevant(
            "Xbox Series X",
            "Microsoft Xbox Series X 1TB Consola Negra",
            sponsored=False,
        )
        assert r.passed


# ─────────────────────────────────────────────────────────────────
# Relevancia general
# ─────────────────────────────────────────────────────────────────

class TestRelevance:
    def test_asus_rog_rejected_for_xbox_query(self):
        r = is_relevant("Xbox Series X", "ASUS ROG Strix G15 Laptop Gaming AMD Ryzen 9")
        assert not r.passed
        assert r.reason == "relevance"

    def test_exact_match_passes(self):
        r = is_relevant("Xbox Series X", "Xbox Series X 1TB — última unidad")
        assert r.passed

    def test_partial_match_above_threshold_passes(self):
        # "Xbox Series X" → tokens: xbox, series, x (3)
        # título tiene xbox y series → 2/3 = 66% > 50% threshold
        r = is_relevant("Xbox Series X", "Consola Xbox de la Series más poderosa")
        assert r.passed


# ─────────────────────────────────────────────────────────────────
# filter_results (integración)
# ─────────────────────────────────────────────────────────────────

class TestFilterResults:
    ITEMS = [
        {"title": "Microsoft Xbox Series X 1TB",            "price": 2_499_900, "sponsored": False},
        {"title": "Control Xbox Series X inalámbrico",       "price":   249_900, "sponsored": False},
        {"title": "Xbox Series S 512GB Consola",             "price": 1_299_900, "sponsored": False},
        {"title": "ASUS ROG Laptop Gaming",                  "price": 4_500_000, "sponsored": False},
        {"title": "Consola Xbox Series X Edición Especial",  "price": 2_699_900, "sponsored": True},
    ]

    def test_only_correct_xbox_passes(self):
        kept = filter_results("Xbox Series X", self.ITEMS)
        titles = [i["title"] for i in kept]
        assert "Microsoft Xbox Series X 1TB" in titles
        assert len(kept) == 1

    def test_empty_input(self):
        assert filter_results("Xbox Series X", []) == []

    def test_all_pass_unrelated_query(self):
        """Si la query no tiene pistas de producto principal, los accesorios no se filtran."""
        items = [
            {"title": "Cable HDMI 2.1 2 metros", "price": 50_000, "sponsored": False},
        ]
        kept = filter_results("cable hdmi", items)
        assert len(kept) == 1
