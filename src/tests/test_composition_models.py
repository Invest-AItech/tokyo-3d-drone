import pytest
from pydantic import ValidationError

from app.core.composition_models import (
    MAX_POINTS, MAX_TOTAL_DISTANCE_M, MAX_BUFFER_M, MIN_BUFFER_M,
    MAX_SPEED_KMH, MIN_SPEED_KMH, MAX_ALT_M, MIN_ALT_M,
    MAX_HOVER_S, MAX_CORNER_RADIUS_M,
    Point, Segment, GlobalSettings, Composition,
)


def test_constants_have_expected_values():
    assert MAX_POINTS == 50
    assert MAX_TOTAL_DISTANCE_M == 20_000
    assert MAX_BUFFER_M == 500
    assert MIN_BUFFER_M == 50
    assert MAX_SPEED_KMH == 200
    assert MIN_SPEED_KMH == 1
    assert MAX_ALT_M == 500
    assert MIN_ALT_M == 1
    assert MAX_HOVER_S == 10
    assert MAX_CORNER_RADIUS_M == 200


class TestPoint:
    def test_valid_point(self):
        p = Point(id="A", lon=139.7671, lat=35.6812, altM=80, pitchDeg=-10, headingRelDeg=0)
        assert p.id == "A"
        assert p.hoverS == 0  # default
        assert p.cornerRadiusM is None  # default

    def test_alt_below_min_rejected(self):
        with pytest.raises(ValidationError):
            Point(id="A", lon=0, lat=0, altM=0, pitchDeg=0, headingRelDeg=0)

    def test_alt_above_max_rejected(self):
        with pytest.raises(ValidationError):
            Point(id="A", lon=0, lat=0, altM=501, pitchDeg=0, headingRelDeg=0)

    def test_pitch_out_of_range_rejected(self):
        with pytest.raises(ValidationError):
            Point(id="A", lon=0, lat=0, altM=10, pitchDeg=46, headingRelDeg=0)
        with pytest.raises(ValidationError):
            Point(id="A", lon=0, lat=0, altM=10, pitchDeg=-90, headingRelDeg=0)

    def test_heading_rel_wraps_at_180(self):
        with pytest.raises(ValidationError):
            Point(id="A", lon=0, lat=0, altM=10, pitchDeg=0, headingRelDeg=181)

    def test_hover_above_max_rejected(self):
        with pytest.raises(ValidationError):
            Point(id="A", lon=0, lat=0, altM=10, pitchDeg=0, headingRelDeg=0, hoverS=11)

    def test_corner_radius_above_max_rejected(self):
        with pytest.raises(ValidationError):
            Point(id="A", lon=0, lat=0, altM=10, pitchDeg=0, headingRelDeg=0, cornerRadiusM=201)


class TestSegment:
    def test_valid_segment(self):
        s = Segment(**{"from": "A", "to": "B", "speedKmh": 80})
        assert s.from_ == "A"
        assert s.to == "B"
        assert s.speedKmh == 80
        assert s.durationS is None

    def test_valid_segment_with_duration_only(self):
        # durationS 単独（推奨フォーマット）
        s = Segment(**{"from": "A", "to": "B", "durationS": 12.5})
        assert s.durationS == 12.5
        assert s.speedKmh is None

    def test_valid_segment_with_both(self):
        # 両方指定は許容（durationS が優先される。バリデーションは通る）
        s = Segment(**{"from": "A", "to": "B", "durationS": 30, "speedKmh": 80})
        assert s.durationS == 30
        assert s.speedKmh == 80

    def test_segment_without_timing_rejected(self):
        # どちらも未指定は不正
        with pytest.raises(ValidationError, match="duration"):
            Segment(**{"from": "A", "to": "B"})

    def test_speed_below_min_rejected(self):
        with pytest.raises(ValidationError):
            Segment(**{"from": "A", "to": "B", "speedKmh": 0})

    def test_speed_above_max_rejected(self):
        with pytest.raises(ValidationError):
            Segment(**{"from": "A", "to": "B", "speedKmh": 201})

    def test_duration_below_min_rejected(self):
        with pytest.raises(ValidationError):
            Segment(**{"from": "A", "to": "B", "durationS": 0.05})

    def test_duration_above_max_rejected(self):
        with pytest.raises(ValidationError):
            Segment(**{"from": "A", "to": "B", "durationS": 601})


class TestGlobalSettings:
    def test_valid_global(self):
        g = GlobalSettings(tau=0.4, lookaheadM=30, bufferM=100, lod="lod2", cornerRadiusM=20)
        assert g.lod == "lod2"

    def test_buffer_below_min_rejected(self):
        with pytest.raises(ValidationError):
            GlobalSettings(tau=0.4, lookaheadM=30, bufferM=49, lod="lod2", cornerRadiusM=20)

    def test_invalid_lod_rejected(self):
        with pytest.raises(ValidationError):
            GlobalSettings(tau=0.4, lookaheadM=30, bufferM=100, lod="lod3", cornerRadiusM=20)


VALID_GLOBAL = {"tau": 0.4, "lookaheadM": 30, "bufferM": 100, "lod": "lod2", "cornerRadiusM": 20}


def _make_point(pid: str, lon: float, lat: float):
    return {"id": pid, "lon": lon, "lat": lat, "altM": 50, "pitchDeg": -10, "headingRelDeg": 0}


class TestComposition:
    def test_minimum_two_points(self):
        c = Composition.model_validate({
            "v": 1,
            "name": "test",
            "global": VALID_GLOBAL,
            "points": [_make_point("A", 139.7671, 35.6812), _make_point("B", 139.7500, 35.6700)],
            "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
        })
        assert len(c.points) == 2

    def test_only_one_point_rejected(self):
        with pytest.raises(ValidationError):
            Composition.model_validate({
                "v": 1, "global": VALID_GLOBAL,
                "points": [_make_point("A", 139.7671, 35.6812)],
                "segments": [],
            })

    def test_too_many_points_rejected(self):
        # 51 点 (A, A1..A50)
        pts = [_make_point("A", 139.0, 35.0)] + [_make_point(f"A{i}", 139.0 + i * 0.0001, 35.0) for i in range(1, 51)]
        segs = [{"from": pts[i]["id"], "to": pts[i + 1]["id"], "speedKmh": 80} for i in range(len(pts) - 1)]
        with pytest.raises(ValidationError):
            Composition.model_validate({"v": 1, "global": VALID_GLOBAL, "points": pts, "segments": segs})

    def test_duplicate_point_id_rejected(self):
        with pytest.raises(ValidationError, match="duplicate"):
            Composition.model_validate({
                "v": 1, "global": VALID_GLOBAL,
                "points": [_make_point("A", 139.0, 35.0), _make_point("A", 139.1, 35.1)],
                "segments": [{"from": "A", "to": "A", "speedKmh": 80}],
            })

    def test_segments_not_connecting_in_order_rejected(self):
        # A → B → C なのに segments が [A→B, A→C] のように飛ぶ
        with pytest.raises(ValidationError, match="segments"):
            Composition.model_validate({
                "v": 1, "global": VALID_GLOBAL,
                "points": [_make_point("A", 139.0, 35.0), _make_point("B", 139.1, 35.0), _make_point("C", 139.2, 35.0)],
                "segments": [{"from": "A", "to": "B", "speedKmh": 80}, {"from": "A", "to": "C", "speedKmh": 80}],
            })

    def test_segments_count_mismatch_rejected(self):
        with pytest.raises(ValidationError, match="segments"):
            Composition.model_validate({
                "v": 1, "global": VALID_GLOBAL,
                "points": [_make_point("A", 139.0, 35.0), _make_point("B", 139.1, 35.0), _make_point("C", 139.2, 35.0)],
                "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
            })

    def test_total_distance_over_max_rejected(self):
        # 2 点で 25km 以上離す（東京付近で経度 0.3 度 ≒ 27km）
        with pytest.raises(ValidationError, match="distance"):
            Composition.model_validate({
                "v": 1, "global": VALID_GLOBAL,
                "points": [_make_point("A", 139.5, 35.6), _make_point("B", 139.8, 35.6)],
                "segments": [{"from": "A", "to": "B", "speedKmh": 80}],
            })

    def test_unknown_segment_endpoint_rejected(self):
        with pytest.raises(ValidationError):
            Composition.model_validate({
                "v": 1, "global": VALID_GLOBAL,
                "points": [_make_point("A", 139.0, 35.0), _make_point("B", 139.1, 35.0)],
                "segments": [{"from": "A", "to": "Z", "speedKmh": 80}],
            })
