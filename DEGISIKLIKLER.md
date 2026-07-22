# PEXURA güncelleme özeti

## Güvenlik ve veri bütünlüğü

- Bildirim metinleri artık HTML olarak çalıştırılmıyor.
- Ürün adı, kodu, birimi ve resim adresleri güvenli biçimde işleniyor.
- Yedek geri yüklemede uygulama sürümü, tablo yapısı, kayıt sayısı ve 25 MB dosya sınırı doğrulanıyor.
- Stok hareketleri yedeğe dahil edildi.
- Toplu silme için `SİL` yazılı onayı eklendi.
- Toplu silme ve zaman geri alma öncesinde otomatik JSON yedeği indiriliyor.

## Kod yapısı

- Ortak güvenlik, depolama, geciktirme ve boşta çalışma yardımcıları `core.js` dosyasına ayrıldı.
- PWA kaydı ve bağlantı durumu yönetimi `pwa.js` dosyasına ayrıldı.

## Performans

- Veri yenilenince tüm sekmeler yerine yalnızca açık sekme çiziliyor.
- Ürün ve işlem geçmişi aramaları gecikmeli çalışıyor.
- Mobil tablo etiketleme işi tarayıcının boş zamanına bırakılıyor.
- Ayrıntılı analiz kartları dashboard'dan ayrı Raporlar sekmesine taşındı.
- Dashboard kart sırası sürükle-bırak veya oklarla değiştirilebiliyor ve otomatik kaydediliyor.

## Mobil kullanım

- Dokunma hedefleri mobilde en az 44 piksel yapıldı.
- Çevrimiçi/çevrimdışı durum göstergesi eklendi.
- Küçük ekranda durum göstergesi alt menüyü kapatmayacak şekilde konumlandırıldı.

## Raporlar

- Seçilen aya ait satış, iade, tahsilat, ödeme, gelir ve gider hareketlerini Excel uyumlu CSV olarak indirme eklendi.
- Başlangıçtan bugüne net ürün satışı, satılan ürün maliyeti, brüt kâr, diğer gelir, gider, tahsilat, ödeme ve stok maliyet değeri birlikte hesaplanıyor.
- Genel sonuç kârda, zararda veya başa baş durumunu açıkça gösteriyor.
- Bu ay bölümü ürün satışı, maliyet, brüt kâr, diğer gelir, gider ve net sonucu ayrı gösteriyor.
- İadeler satış ve satılan ürün maliyetinden ters yönde düşülüyor.
- Son 6 aylık net kâr grafiği ve önceki aya göre değişim eklendi.
- En çok kazandıran ve en çok satan ürün raporları eklendi.
- Stokta olup 60 günden uzun süredir satılmayan ürünler raporu eklendi.
- Başlangıç/bitiş tarihi seçilebilen dönemsel kâr-zarar hesabı eklendi.
- Ana para birimi USD olarak düzenlendi; para birimi olmayan gelir/giderler yalnız USD raporuna dahil ediliyor.

## PDF tasarımı

- Fatura PDF'lerine faturadan önceki borç, yeni alış/iade, faturada ödenen ve fatura sonrası toplam borç eklendi.
- Cari borcu fatura tarihinden önceki fatura ve kasa hareketleriyle kronolojik hesaplanıyor.
- PEXURA TECH logosu, başlıklar, çizgiler ve tablo başlıkları siyah-altın premium kimliğe geçirildi.

## PWA ve çevrimdışı çalışma

- Alt klasörde yayınlama için göreli önbellek yolları kullanıldı.
- Yerel, maskelenebilir uygulama ikonu eklendi.
- Çekirdek, font, stil ve uygulama dosyaları çevrimdışı önbelleğe dahil edildi.
- Ağ öncelikli çalışma ve çevrimdışı önbellek geri dönüşü eklendi.

## Sunucu tarafı notu

Supabase tablolarındaki RLS politikaları ayrıca kontrol edilmelidir. Arayüzde sekmeleri gizlemek veritabanı yetkilendirmesinin yerine geçmez.
