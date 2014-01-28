require 'bundler'
Bundler.require

$stdout.sync = true

require 'boiler'
require './config'

$app = Boiler.new(ContactsService.boiler_config)

class Boiler::App::ContentSecurityPolicy
  alias _content_security_policy_rules content_security_policy_rules
  def content_security_policy_rules
    rules = _content_security_policy_rules

    src = "'self' #{ENV['ALLOWED_ORIGIN_CSP']}"

    rules['frame-src'] = src
    rules['frame-ancestors'] = src

    rules
  end
end

map '/' do
  use Rack::Session::Cookie,  :key => 'messenger.session',
                              :expire_after => 2592000, # 1 month
                              :secret => ENV['SESSION_SECRET'] || SecureRandom.hex
  run $app
end
