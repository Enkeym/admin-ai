// Функция для определения расширения медиа
export function getMediaFileExtension(media) {
  if (media.photo) return 'jpg'
  if (media.video) return 'mp4'
  if (media.audio) return 'mp3'
  if (media.document) {
    const mimeType = media.document.mimeType
    switch (mimeType) {
      case 'image/jpeg':
        return 'jpg'
      case 'image/png':
        return 'png'
      case 'image/gif':
        return 'gif'
      case 'image/bmp':
        return 'bmp'
      case 'image/webp':
        return 'webp'
      case 'image/svg+xml':
        return 'svg'
      case 'image/tiff':
        return 'tiff'

      // Видео
      case 'video/mp4':
        return 'mp4'
      case 'video/x-msvideo':
        return 'avi'
      case 'video/mpeg':
        return 'mpeg'
      case 'video/webm':
        return 'webm'
      case 'video/quicktime':
        return 'mov'
      case 'video/x-matroska':
        return 'mkv'
      case 'video/x-flv':
        return 'flv'

      // Аудио
      case 'audio/mpeg':
        return 'mp3'
      case 'audio/x-wav':
        return 'wav'
      case 'audio/ogg':
        return 'ogg'
      case 'audio/aac':
        return 'aac'
      case 'audio/flac':
        return 'flac'
      case 'audio/webm':
        return 'weba'

      // Документы
      case 'application/pdf':
        return 'pdf'
      case 'application/msword':
        return 'doc'
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return 'docx'
      case 'application/vnd.ms-excel':
        return 'xls'
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return 'xlsx'
      case 'application/vnd.ms-powerpoint':
        return 'ppt'
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return 'pptx'

      // Архивы
      case 'application/zip':
        return 'zip'
      case 'application/x-rar-compressed':
        return 'rar'
      case 'application/x-7z-compressed':
        return '7z'
      case 'application/gzip':
        return 'gz'

      // Текстовые файлы
      case 'text/plain':
        return 'txt'
      case 'text/html':
        return 'html'
      case 'text/css':
        return 'css'
      case 'application/json':
        return 'json'
      case 'application/javascript':
        return 'js'
      case 'application/xml':
        return 'xml'

      // Прочие форматы
      case 'application/octet-stream':
        return 'bin'
      default:
        console.warn(`Неизвестный MIME-тип: ${mimeType}`)
        return 'bin'
    }
  }
  return 'bin'
}
