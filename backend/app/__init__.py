import os

# Local development reads keys from backend/.env; in Docker they come from env_file.
_env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(_env):
    for _line in open(_env, encoding="utf-8"):
        if "=" in _line and not _line.lstrip().startswith("#"):
            _key, _value = _line.strip().split("=", 1)
            os.environ.setdefault(_key, _value)
