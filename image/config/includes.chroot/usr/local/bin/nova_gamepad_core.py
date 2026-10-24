"""Pure joystick event decoder for Linux /dev/input/jsN, no privileged access."""
import re
import struct

JS_EVENT_BUTTON = 0x01
JS_EVENT_AXIS = 0x02
JS_EVENT_INIT = 0x80
STRUCT = struct.Struct('<IhBB')


def decode_event(packet):
    if len(packet) != STRUCT.size:
        raise ValueError('Joystick event must be 8 bytes')
    timestamp, value, event_type, number = STRUCT.unpack(packet)
    kind = event_type & ~JS_EVENT_INIT
    if kind not in (JS_EVENT_BUTTON, JS_EVENT_AXIS):
        return None
    return {'time_ms': timestamp, 'kind': 'button' if kind == JS_EVENT_BUTTON else 'axis',
            'number': number, 'value': value, 'initial': bool(event_type & JS_EVENT_INIT)}


def valid_js_device(path):
    return bool(re.fullmatch(r'/dev/input/js[0-9]{1,3}', str(path)))
