require 'contacts-service/version'

module ContactsService
  def self.settings
    @settings ||= {}
  end

  def self.configure
    if block_given?
      yield(self.settings)
    end

    self.settings[:public_dir] ||= File.expand_path('../../public/assets', __FILE__) # lib/../public/assets
    self.settings[:asset_paths] ||= [
      File.expand_path('../../src', __FILE__),
      File.expand_path('../../vendor', __FILE__)
    ]
    self.settings[:asset_paths].uniq!
  end

  module Sprockets
    # Append asset paths to an existing Sprockets environment
    def self.setup(environment, &block)
      ContactsService.configure(&block)
      ContactsService.settings[:asset_paths].each do |path|
        environment.append_path(path)
      end
    end
  end
end
