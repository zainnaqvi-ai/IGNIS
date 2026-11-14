"""Optional refresh of the bundled Natural Earth 1:50m contextual map.
Download ne_50m_admin_0_countries, ne_50m_admin_1_states_provinces_lines,
ne_50m_rivers_lake_centerlines GeoJSON from natural-earth-vector into
data/work/{land,states,rivers}.geojson. No observations depend on these files.
"""
import json

from .inspect_inputs import PUBLIC, ROOT, save_json


def clip(points, box, polygon):
    sequences = [points]
    for axis, limit, direction in [(0,box[0],1),(1,box[1],1),(0,box[2],-1),(1,box[3],-1)]:
        segments = []
        for line in sequences:
            if not line:
                continue
            segment = []
            previous = line[-1] if polygon else line[0]
            for point in line:
                inside = (point[axis]-limit)*direction >= 0
                was_inside = (previous[axis]-limit)*direction >= 0
                if inside != was_inside:
                    t = (limit-previous[axis])/(point[axis]-previous[axis])
                    cut = [a+t*(b-a) for a,b in zip(previous,point)]
                    segment.append(cut)
                    if not polygon and not inside:
                        segments.append(segment)
                        segment = []
                if inside:
                    segment.append(point)
                previous = point
            if segment:
                segments.append(segment)
        sequences = segments
    return [[[round(x,4),round(y,4)] for x,y in line] for line in sequences if len(line)>=(3 if polygon else 2)]


def main():
    for region, box in {"california":[-134,24,-105,50],"lahore":[68,26,80,37]}.items():
        output = []
        for layer in ("land","states","rivers"):
            data = json.loads((ROOT/f"data/work/{layer}.geojson").read_text(encoding="utf-8"))
            for feature in data["features"]:
                geo = feature["geometry"]
                shape = geo["coordinates"]
                lines = ([poly[0] for poly in shape] if geo["type"]=="MultiPolygon" else [shape[0]]) if layer=="land" else (
                    shape if geo["type"]=="MultiLineString" else [shape])
                for line in lines:
                    for section in clip(line,box,layer=="land"):
                        output.append([layer,section])
        save_json(PUBLIC/region/"backdrop.json",output)


if __name__ == "__main__":
    main()
