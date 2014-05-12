contacts-service
----------------

Syncs Tent contacts with localStorage and exposes it to other (whitelisted) apps via a simple postMessage API.

## Configuration

ENV              | Required | Description
---------------- | -------- | -----------
`URL`            | Required | URL of daemon.
`ALLOWED_ORIGIN` | Required | JavaScript Regex string (excluding `/`s) describing the allowed origin the daemon may accept requests from (e.g. "^https:\\/\\/example.com\\/?").
`SENTRY_URL`     | Optional | See [boiler-web](https://github.com/cupcake/boiler-web) for details.

## API Client

Add this to your Gemfile:

```ruby
gem 'contacts-service', :git => 'git://github.com/cupcake/contacts-service.git'
```

and tell it to configure Sprockets paths:

```ruby
require 'contacts-service'
ContactsService::Sprockets.setup(sprockets_environment)
```
