#!/usr/bin/env python3
"""Moved to server/api/tools/svga-to-fx.py: the API converts the SVGA an admin uploads with it (Yönetim › Hediyeler).
This runs that one with the same arguments:

    python3 app/scripts/svga-to-fx.py in.svga out.mp4 [--size 540x960] [--fill 0.6] …
"""
import os
import runpy

runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'server', 'api', 'tools', 'svga-to-fx.py'), run_name='__main__')
