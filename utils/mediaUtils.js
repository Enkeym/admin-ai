// Функция для определения расширения медиа
export function getMediaFileExtension(media) {
  if (media.photo) return 'jpg'
  if (media.video) return 'mp4'
  if (media.audio) return 'mp3'

  if (media.document && media.document.mimeType) {
    const mimeType = media.document.mimeType

    const mimeToExtensionMap = {
      // Изображения
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/tiff': 'tiff',
      'image/vnd.adobe.photoshop': 'psd',
      'image/x-icon': 'ico',

      // Видео
      'video/mp4': 'mp4',
      'video/x-msvideo': 'avi',
      'video/mpeg': 'mpeg',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-matroska': 'mkv',
      'video/x-flv': 'flv',

      // Аудио
      'audio/mpeg': 'mp3',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
      'audio/flac': 'flac',
      'audio/webm': 'weba',
      'audio/x-m4a': 'm4a',

      // Документы
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        'pptx',
      'application/vnd.oasis.opendocument.text': 'odt',
      'application/vnd.oasis.opendocument.spreadsheet': 'ods',
      'application/vnd.oasis.opendocument.presentation': 'odp',
      'application/vnd.ms-project': 'mpp',

      // Архивы
      'application/zip': 'zip',
      'application/x-rar-compressed': 'rar',
      'application/x-7z-compressed': '7z',
      'application/gzip': 'gz',
      'application/x-tar': 'tar',

      // Текстовые файлы
      'text/plain': 'txt',
      'text/html': 'html',
      'text/css': 'css',
      'application/json': 'json',
      'application/javascript': 'js',
      'application/xml': 'xml',
      'text/markdown': 'md',
      'application/x-sh': 'sh',
      'application/sql': 'sql',

      // Шрифты
      'font/ttf': 'ttf',
      'font/woff': 'woff',
      'font/woff2': 'woff2',
      'application/vnd.ms-fontobject': 'eot',
      'font/otf': 'otf',

      // Программы и исполняемые файлы
      'application/x-msdownload': 'exe',
      'application/x-apple-diskimage': 'dmg',
      'application/vnd.android.package-archive': 'apk',

      // Прочие форматы
      'application/x-httpd-php': 'php',
      'application/x-perl': 'pl',
      'application/x-python-code': 'py',
      'application/x-ruby': 'rb'
    }

    return mimeToExtensionMap[mimeType] || 'document'
  }

  console.warn(
    'Не удалось определить MIME-тип для медиа. Возвращаем "document".'
  )
  return 'document'
}
