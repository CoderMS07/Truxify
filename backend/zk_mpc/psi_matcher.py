# Stub for spec 57
# === Spec 57: handshake timeout ===
import socket
def mpc_handshake_with_timeout(addr, t=30):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(t)
    try: s.connect(addr); return s
    except socket.timeout:
        s.close(); raise TimeoutError("timeout")

