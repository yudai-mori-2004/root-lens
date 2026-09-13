Pod::Spec.new do |s|
  s.name           = 'file_hash'
  s.version        = '0.1.0'
  s.summary        = 'Native streaming SHA-256 for recording source files'
  s.homepage       = 'https://rootlens.io'
  s.license        = 'MIT'
  s.author         = 'RootLens'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'

  s.source_files   = '**/*.{swift,h,m}'

  s.dependency 'ExpoModulesCore'
end
