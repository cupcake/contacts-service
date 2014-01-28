module ContactsService
  def self.project_root
    @project_root ||= File.expand_path(File.dirname(__FILE__))
  end

  def self.boiler_config
    {
      :skip_authentication => true,
      :assets_dir => ENV['ASSETS_DIR'] || File.join(project_root, 'public'),
      :asset_roots => [
        File.join(project_root, 'src')
      ],
      :asset_names => %w(
        raven.js
        raven_config.js
        marbles.js
        tent-client.js
        contacts_api.js
        contacts_service.js
      ),
      :layout_roots => [
        File.join(project_root, 'layout')
      ],
      :layouts => [{
        :name => :contacts_service,
        :route => '/*'
      }]
    }
  end
end
