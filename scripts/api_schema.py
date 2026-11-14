"""Print the versioned API schema without starting services or using a model key."""

import json
from dataclasses import replace

from nova_ember.api.config import Settings
from nova_ember.api.main import create_app

settings = replace(Settings.from_environment(), openai_api_key=None)
print(json.dumps(create_app(settings).openapi(), sort_keys=True, indent=2))
