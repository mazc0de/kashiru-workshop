# Satu instalasi untuk satu bengkel, tanpa tenant_id

Setiap bengkel mendapat project Supabase dan deploy frontend sendiri. Skema tidak punya kolom `tenant_id`, dan RLS hanya memeriksa apakah user login berstatus aktif. Kalau Kashiru dipasang di bengkel lain, caranya deploy ulang dengan skrip setup, bukan menambah tenant ke database bersama. Pilihan ini membuat skema dan RLS sederhana dan data antarbengkel terpisah total. Konsekuensinya, pembaruan aplikasi dan migrasi harus dijalankan di setiap instalasi.
