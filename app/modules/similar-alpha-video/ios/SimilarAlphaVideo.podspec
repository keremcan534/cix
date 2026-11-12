Pod::Spec.new do |s|
  s.name           = 'SimilarAlphaVideo'
  s.version        = '1.0.0'
  s.summary        = 'Transparent (stacked-alpha) video view for Similar Club (POC)'
  s.description    = 'AVPlayer + Core Image video composition: colour on top, alpha mask below.'
  s.author         = 'Similar Club'
  s.homepage       = 'https://github.com/similarclub'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
