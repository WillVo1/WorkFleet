#!/usr/bin/env python3
"""Create a GES project file with a video clip on the timeline.

Usage: python3 setup_pitivi.py /path/to/video.mp4
Outputs: /tmp/test-project.xges
"""
import sys
import gi
gi.require_version("GES", "1.0")
gi.require_version("Gst", "1.0")
from gi.repository import GES, Gst, GLib

Gst.init(None)
GES.init()

if len(sys.argv) < 2:
    print("Usage: setup_pitivi.py <video_file>")
    sys.exit(1)

video_path = sys.argv[1]
uri = Gst.filename_to_uri(video_path)

asset = GES.UriClipAsset.request_sync(uri)
print(f"Asset duration: {asset.get_duration()}")

timeline = GES.Timeline.new()
video_track = GES.VideoTrack.new()
audio_track = GES.AudioTrack.new()
timeline.add_track(video_track)
timeline.add_track(audio_track)

layer = timeline.append_layer()
clip = layer.add_asset(asset, 0, 0, asset.get_duration(), GES.TrackType.UNKNOWN)
print(f"Clip: {clip}")
timeline.commit()

ml = GLib.MainLoop()

def do_save():
    ret = timeline.save_to_uri("file:///tmp/test-project.xges", None, True)
    print(f"save_to_uri result: {ret}")
    ml.quit()

GLib.timeout_add_seconds(1, do_save)
ml.run()
print("Done")
