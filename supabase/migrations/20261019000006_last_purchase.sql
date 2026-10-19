-- Kashiru 6: harga beli dan supplier terakhir per part (PRD 4.3 saran belanja, PRD 4.4 penerimaan).
-- Penerimaan yang di-void dan baris barang bonus (Rp 0) tidak dihitung sebagai harga beli terakhir.

create or replace view public.last_purchase
with (security_invoker = true)
as
select distinct on (ri.product_id)
  ri.product_id,
  ri.harga_beli,
  r.supplier_id,
  s.nama as supplier,
  r.nomor,
  r.dibuat_pada
from public.receipt_items ri
join public.receipts r on r.id = ri.receipt_id and r.status = 'aktif'
left join public.suppliers s on s.id = r.supplier_id
where ri.harga_beli > 0
order by ri.product_id, r.dibuat_pada desc, ri.urutan desc;

-- Hak akses ditulis eksplisit (lihat migrasi 3).
grant select on public.last_purchase to authenticated, service_role;
