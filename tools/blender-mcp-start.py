"""Serve the Blender Lab MCP addon from this session, without saving preferences.

Run by tools/blender-mcp.mjs as `blender --python blender-mcp-start.py -- <addon dir>`.
An already enabled copy of the addon (e.g. an installed extension) is reused,
otherwise the project checkout is enabled for this session only.
"""
import os
import sys

import addon_utils
import bpy

PORT = int(os.environ.get('BLENDER_MCP_PORT', '9876'))
preferences = bpy.context.preferences
was_dirty = preferences.is_dirty


def find_enabled():
    for name in preferences.addons.keys():
        if name + '.mcp_to_blender_server' in sys.modules:
            return name
    return None


name = find_enabled()
if name is None:
    sys.path.insert(0, sys.argv[sys.argv.index('--') + 1])
    # The addon reads its settings from its preferences entry, so it needs one;
    # the dirty flag is reset below so the entry is not saved on quit.
    addon_utils.enable('blender_mcp_addon', default_set=True)
    name = 'blender_mcp_addon'

addon = preferences.addons[name].preferences
if addon.port != PORT:
    addon.port = PORT
preferences.is_dirty = was_dirty
server = sys.modules[name + '.mcp_to_blender_server']


def ensure_started():
    # The addon's own autostart may be disabled or delayed; start it if not running.
    if server.is_running():
        return None
    try:
        bpy.ops.blmcp.server_start()
    except RuntimeError as ex:
        print(f'Blender MCP: {ex}', file=sys.stderr)
    return None


bpy.app.timers.register(ensure_started, first_interval=addon.autostart_delay + 1.0)
