Pod::Spec.new do |s|
  s.name = 'ArcaDocumentReader'
  s.version = '1.0.0'
  s.summary = 'Local-only PDF text extraction for ARCA Tracker'
  s.description = 'Extracts selectable PDF text using PDFKit without uploading files.'
  s.license = { :type => 'MIT' }
  s.author = 'ARCA Tracker'
  s.homepage = 'https://github.com/PedroHRFerreira/arca-tracker'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/PedroHRFerreira/arca-tracker.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit'
  s.source_files = '**/*.swift'
end
