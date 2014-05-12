require 'static-sprockets'
require 'marbles-js'
require 'marbles-tent-client-js'
require 'raven-js'
require 'yajl'

StaticSprockets.sprockets_config do |environment|
  MarblesJS::Sprockets.setup(environment)
  MarblesTentClientJS::Sprockets.setup(environment)
  RavenJS::Sprockets.setup(environment)
end

StaticSprockets.configure(
  :asset_roots => [
    File.expand_path(File.dirname(__FILE__)),
  ],
  :asset_types => %w( src ), # we only have javascripts and they're in {root}/src
  :layout => File.expand_path(File.join(File.dirname(__FILE__), 'layout', 'contacts_service.html.erb')),
  :layout_output_name => 'contacts_service.html',
  :output_dir => ENV['OUTPUT_DIR'] || File.expand_path(File.join(File.dirname(__FILE__), 'build')),
  :asset_root => ENV['ASSET_ROOT'] || "/assets"
)
