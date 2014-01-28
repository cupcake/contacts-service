require 'bundler/setup'

require 'boiler'
require './config'

require 'boiler/tasks/assets'
require 'boiler/tasks/layout'

task :configure do
  config = ContactsService.boiler_config
  Boiler.configure(config)
  Boiler.settings[:asset_names] = config[:asset_names]
end

task :compile => ['configure', 'assets:precompile', 'layout:compile'] do
end

precompile_task = Rake::Task['assets:precompile']
prerequisites = precompile_task.prerequisites.dup
precompile_task.clear_prerequisites
precompile_task.enhance([:configure] + prerequisites)
