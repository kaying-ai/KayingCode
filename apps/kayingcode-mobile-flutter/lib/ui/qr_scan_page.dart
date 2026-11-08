import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image/image.dart' as img_lib;
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:zxing2/qrcode.dart';

import '../l10n/strings.dart';
import '../protocol/connection_params.dart';
import 'theme.dart';

/// QR scan page: camera scan (mobile_scanner) + decode from a picked image
/// (pure-Dart zxing2, works everywhere). Pops with the scanned URL string.
class QrScanPage extends StatefulWidget {
  const QrScanPage({super.key});

  @override
  State<QrScanPage> createState() => _QrScanPageState();
}

class _QrScanPageState extends State<QrScanPage> {
  late final MobileScannerController _controller;
  bool _handled = false;
  String? _cameraError;
  bool _decodingImage = false;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _accept(String? raw) {
    if (_handled || raw == null || raw.trim().isEmpty) return;
    final text = raw.trim();
    _handled = true;
    Navigator.of(context).pop(text);
  }

  Future<void> _pickImage() async {
    if (_decodingImage) return;
    setState(() => _decodingImage = true);
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(source: ImageSource.gallery);
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final text = decodeQrFromImageBytes(bytes);
      if (text != null) {
        _accept(text);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(tr(context, 'qr.noQrInImage'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              tr(context, 'qr.imageDecodeFailed', args: {'error': e}),
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _decodingImage = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'qr.title')),
        actions: [
          IconButton(
            icon: const Icon(Icons.image_outlined),
            tooltip: tr(context, 'qr.pickImage'),
            onPressed: _decodingImage ? null : _pickImage,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _cameraError != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        tr(
                          context,
                          'qr.cameraUnavailable',
                          args: {'error': _cameraError},
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  )
                : MobileScanner(
                    controller: _controller,
                    onDetect: (capture) {
                      for (final barcode in capture.barcodes) {
                        _accept(barcode.rawValue);
                        if (_handled) break;
                      }
                    },
                    errorBuilder: (context, error) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (mounted && _cameraError == null) {
                          setState(
                            () => _cameraError =
                                error.errorDetails?.message ??
                                '${error.errorCode}',
                          );
                        }
                      });
                      return Center(
                        child: Text(tr(context, 'qr.cameraInitFailed')),
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              tr(context, 'qr.hint'),
              style: TextStyle(
                color: EmberColors.of(context).textMuted,
                fontSize: 12,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

/// Decodes a QR code from image bytes using the pure-Dart zxing2 reader.
String? decodeQrFromImageBytes(Uint8List bytes) {
  final decoded = img_lib.decodeImage(bytes);
  if (decoded == null) return null;
  // uint1/uint4 等小位深格式下通道值不是 0-255,直接读会得到垃圾亮度,先归一。
  final image = decoded.format == img_lib.Format.uint8
      ? decoded
      : decoded.convert(format: img_lib.Format.uint8);
  final width = image.width;
  final height = image.height;
  if (width > 4096 || height > 4096) {
    return null;
  }
  final pixels = Int32List(width * height);
  var i = 0;
  for (final pixel in image) {
    final a = pixel.a.toInt() & 0xFF;
    final r = pixel.r.toInt() & 0xFF;
    final g = pixel.g.toInt() & 0xFF;
    final b = pixel.b.toInt() & 0xFF;
    pixels[i++] = (a << 24) | (r << 16) | (g << 8) | b;
  }
  final source = RGBLuminanceSource(width, height, pixels);
  // 暗色主题下桌面端可能渲染反色码;普通失败后再试反色与 TRY_HARDER。
  for (final candidate in [source, source.invert()]) {
    try {
      final result = QRCodeReader().decode(
        BinaryBitmap(HybridBinarizer(candidate)),
        hints: DecodeHints()..put(DecodeHintType.tryHarder),
      );
      final text = result.text;
      if (ZflowConnectionParams.parse(text) != null) return text;
      return text.isEmpty ? null : text;
    } catch (_) {
      continue;
    }
  }
  return null;
}
