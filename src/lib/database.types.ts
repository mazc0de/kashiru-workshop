// File ini dibuat oleh `npm run gen:types` dari supabase/migrations. Jangan diedit langsung.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      backup_logs: {
        Row: {
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_devices: {
        Row: {
          device_id: string
          didaftarkan_oleh: string
          id: string
          mulai: string
          nama: string | null
          selesai: string | null
        }
        Insert: {
          device_id: string
          didaftarkan_oleh: string
          id?: string
          mulai?: string
          nama?: string | null
          selesai?: string | null
        }
        Update: {
          device_id?: string
          didaftarkan_oleh?: string
          id?: string
          mulai?: string
          nama?: string | null
          selesai?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashier_devices_didaftarkan_oleh_fkey"
            columns: ["didaftarkan_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          aktif: boolean
          created_at: string
          id: string
          nama: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          id?: string
          nama: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          id?: string
          nama?: string
        }
        Relationships: []
      }
      change_logs: {
        Row: {
          aksi: string
          created_at: string
          data_baru: Json | null
          data_lama: Json | null
          entitas: string
          entitas_id: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          aksi: string
          created_at?: string
          data_baru?: Json | null
          data_lama?: Json | null
          entitas: string
          entitas_id?: string | null
          id?: never
          user_id?: string | null
        }
        Update: {
          aksi?: string
          created_at?: string
          data_baru?: Json | null
          data_lama?: Json | null
          entitas?: string
          entitas_id?: string | null
          id?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_counters: {
        Row: {
          jenis: string
          tanggal: string
          terakhir: number
        }
        Insert: {
          jenis: string
          tanggal: string
          terakhir: number
        }
        Update: {
          jenis?: string
          tanggal?: string
          terakhir?: number
        }
        Relationships: []
      }
      internal_barcode_counter: {
        Row: {
          id: number
          terakhir: number
        }
        Insert: {
          id?: number
          terakhir: number
        }
        Update: {
          id?: number
          terakhir?: number
        }
        Relationships: []
      }
      mechanics: {
        Row: {
          aktif: boolean
          created_at: string
          id: string
          nama: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          id?: string
          nama: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          id?: string
          nama?: string
        }
        Relationships: []
      }
      product_barcodes: {
        Row: {
          barcode: string
          created_at: string
          id: string
          jenis: string
          product_id: string
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: string
          jenis: string
          product_id: string
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: string
          jenis?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_barcodes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_part_numbers: {
        Row: {
          created_at: string
          id: string
          jenis: string
          kode_part: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          jenis: string
          kode_part: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          jenis?: string
          kode_part?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_part_numbers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          aktif: boolean
          bisa_pecahan: boolean
          category_id: string
          created_at: string
          harga_beli_avg: number
          harga_jual: number
          id: string
          merek: string | null
          nama: string
          satuan: string | null
          stok_min: number
          tipe: string
        }
        Insert: {
          aktif?: boolean
          bisa_pecahan?: boolean
          category_id: string
          created_at?: string
          harga_beli_avg?: number
          harga_jual: number
          id?: string
          merek?: string | null
          nama: string
          satuan?: string | null
          stok_min?: number
          tipe: string
        }
        Update: {
          aktif?: boolean
          bisa_pecahan?: boolean
          category_id?: string
          created_at?: string
          harga_beli_avg?: number
          harga_jual?: number
          id?: string
          merek?: string | null
          nama?: string
          satuan?: string | null
          stok_min?: number
          tipe?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aktif: boolean
          created_at: string
          email: string
          id: string
          nama: string
          terakhir_login: string | null
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          email: string
          id: string
          nama: string
          terakhir_login?: string | null
        }
        Update: {
          aktif?: boolean
          created_at?: string
          email?: string
          id?: string
          nama?: string
          terakhir_login?: string | null
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          harga_beli: number
          id: string
          product_id: string
          qty: number
          receipt_id: string
          urutan: number
        }
        Insert: {
          harga_beli: number
          id?: string
          product_id: string
          qty: number
          receipt_id: string
          urutan: number
        }
        Update: {
          harga_beli?: number
          id?: string
          product_id?: string
          qty?: number
          receipt_id?: string
          urutan?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          dibuat_pada: string
          id: string
          no_faktur: string | null
          nomor: string
          status: string
          supplier_id: string | null
          tanggal_faktur: string
          user_id: string
          void_alasan: string | null
          void_oleh: string | null
          void_pada: string | null
        }
        Insert: {
          dibuat_pada?: string
          id?: string
          no_faktur?: string | null
          nomor: string
          status?: string
          supplier_id?: string | null
          tanggal_faktur: string
          user_id: string
          void_alasan?: string | null
          void_oleh?: string | null
          void_pada?: string | null
        }
        Update: {
          dibuat_pada?: string
          id?: string
          no_faktur?: string | null
          nomor?: string
          status?: string
          supplier_id?: string | null
          tanggal_faktur?: string
          user_id?: string
          void_alasan?: string | null
          void_oleh?: string | null
          void_pada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_void_oleh_fkey"
            columns: ["void_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          alokasi_diskon_nota: number
          diskon: number
          diskon_input: number | null
          diskon_jenis: string | null
          harga: number
          hpp_satuan: number | null
          id: string
          jumlah: number
          merek_snapshot: string | null
          nama_snapshot: string
          product_id: string
          qty: number
          sale_id: string
          tipe: string
          urutan: number
        }
        Insert: {
          alokasi_diskon_nota?: number
          diskon?: number
          diskon_input?: number | null
          diskon_jenis?: string | null
          harga: number
          hpp_satuan?: number | null
          id?: string
          jumlah: number
          merek_snapshot?: string | null
          nama_snapshot: string
          product_id: string
          qty: number
          sale_id: string
          tipe: string
          urutan: number
        }
        Update: {
          alokasi_diskon_nota?: number
          diskon?: number
          diskon_input?: number | null
          diskon_jenis?: string | null
          harga?: number
          hpp_satuan?: number | null
          id?: string
          jumlah?: number
          merek_snapshot?: string | null
          nama_snapshot?: string
          product_id?: string
          qty?: number
          sale_id?: string
          tipe?: string
          urutan?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          catatan_servis: string | null
          client_id: string
          device_id: string
          dibuat_pada: string
          disinkron_pada: string
          diskon_nota: number
          diskon_nota_input: number | null
          diskon_nota_jenis: string | null
          id: string
          kembalian: number
          mechanic_id: string | null
          metode_bayar: string
          nama_pelanggan: string | null
          nomor: string
          nomor_asli: string | null
          nopol: string | null
          nopol_kunci: string | null
          status: string
          subtotal: number
          tanggal_nota: string
          total: number
          uang_diterima: number
          urut: number
          user_id: string
          void_alasan: string | null
          void_oleh: string | null
          void_pada: string | null
        }
        Insert: {
          catatan_servis?: string | null
          client_id: string
          device_id: string
          dibuat_pada: string
          disinkron_pada?: string
          diskon_nota?: number
          diskon_nota_input?: number | null
          diskon_nota_jenis?: string | null
          id?: string
          kembalian: number
          mechanic_id?: string | null
          metode_bayar: string
          nama_pelanggan?: string | null
          nomor: string
          nomor_asli?: string | null
          nopol?: string | null
          nopol_kunci?: never
          status?: string
          subtotal: number
          tanggal_nota: string
          total: number
          uang_diterima: number
          urut: number
          user_id: string
          void_alasan?: string | null
          void_oleh?: string | null
          void_pada?: string | null
        }
        Update: {
          catatan_servis?: string | null
          client_id?: string
          device_id?: string
          dibuat_pada?: string
          disinkron_pada?: string
          diskon_nota?: number
          diskon_nota_input?: number | null
          diskon_nota_jenis?: string | null
          id?: string
          kembalian?: number
          mechanic_id?: string | null
          metode_bayar?: string
          nama_pelanggan?: string | null
          nomor?: string
          nomor_asli?: string | null
          nopol?: string | null
          nopol_kunci?: never
          status?: string
          subtotal?: number
          tanggal_nota?: string
          total?: number
          uang_diterima?: number
          urut?: number
          user_id?: string
          void_alasan?: string | null
          void_oleh?: string | null
          void_pada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_mechanic_id_fkey"
            columns: ["mechanic_id"]
            isOneToOne: false
            referencedRelation: "mechanics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_void_oleh_fkey"
            columns: ["void_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_levels: {
        Row: {
          product_id: string
          qty_on_hand: number
        }
        Insert: {
          product_id: string
          qty_on_hand?: number
        }
        Update: {
          product_id?: string
          qty_on_hand?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_levels_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          alasan: string | null
          created_at: string
          hpp_satuan: number
          id: number
          jenis: string
          keterangan: string | null
          product_id: string
          qty: number
          ref_id: string | null
          ref_type: string | null
          user_id: string
        }
        Insert: {
          alasan?: string | null
          created_at?: string
          hpp_satuan: number
          id?: never
          jenis: string
          keterangan?: string | null
          product_id: string
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          user_id: string
        }
        Update: {
          alasan?: string | null
          created_at?: string
          hpp_satuan?: number
          id?: never
          jenis?: string
          keterangan?: string | null
          product_id?: string
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opname_items: {
        Row: {
          alasan: string | null
          alasan_keterangan: string | null
          dihitung_oleh: string | null
          dihitung_pada: string | null
          harga_beli_input: number | null
          keputusan: string
          opname_id: string
          product_id: string
          qty_hitung: number | null
          selisih: number | null
          stok_sistem_saat_hitung: number | null
        }
        Insert: {
          alasan?: string | null
          alasan_keterangan?: string | null
          dihitung_oleh?: string | null
          dihitung_pada?: string | null
          harga_beli_input?: number | null
          keputusan?: string
          opname_id: string
          product_id: string
          qty_hitung?: number | null
          selisih?: number | null
          stok_sistem_saat_hitung?: number | null
        }
        Update: {
          alasan?: string | null
          alasan_keterangan?: string | null
          dihitung_oleh?: string | null
          dihitung_pada?: string | null
          harga_beli_input?: number | null
          keputusan?: string
          opname_id?: string
          product_id?: string
          qty_hitung?: number | null
          selisih?: number | null
          stok_sistem_saat_hitung?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_opname_items_dihitung_oleh_fkey"
            columns: ["dihitung_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_items_opname_id_fkey"
            columns: ["opname_id"]
            isOneToOne: false
            referencedRelation: "stock_opnames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opname_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_opnames: {
        Row: {
          category_id: string | null
          dibatalkan_oleh: string | null
          dibatalkan_pada: string | null
          dibuka_oleh: string
          dibuka_pada: string
          dikonfirmasi_oleh: string | null
          dikonfirmasi_pada: string | null
          id: string
          jenis: string
          nomor: string
          status: string
        }
        Insert: {
          category_id?: string | null
          dibatalkan_oleh?: string | null
          dibatalkan_pada?: string | null
          dibuka_oleh: string
          dibuka_pada?: string
          dikonfirmasi_oleh?: string | null
          dikonfirmasi_pada?: string | null
          id?: string
          jenis: string
          nomor: string
          status?: string
        }
        Update: {
          category_id?: string | null
          dibatalkan_oleh?: string | null
          dibatalkan_pada?: string | null
          dibuka_oleh?: string
          dibuka_pada?: string
          dikonfirmasi_oleh?: string | null
          dikonfirmasi_pada?: string | null
          id?: string
          jenis?: string
          nomor?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_opnames_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opnames_dibatalkan_oleh_fkey"
            columns: ["dibatalkan_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opnames_dibuka_oleh_fkey"
            columns: ["dibuka_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_opnames_dikonfirmasi_oleh_fkey"
            columns: ["dikonfirmasi_oleh"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          alamat: string | null
          auto_logout_jam: number
          awalan_nota: string
          awalan_opname: string
          awalan_penerimaan: string
          blind_count: boolean
          footer_struk: string | null
          id: number
          jumlah_salinan: number
          logo_url: string | null
          nama_bengkel: string
          telepon: string | null
          ukuran_kertas: number
        }
        Insert: {
          alamat?: string | null
          auto_logout_jam?: number
          awalan_nota?: string
          awalan_opname?: string
          awalan_penerimaan?: string
          blind_count?: boolean
          footer_struk?: string | null
          id?: number
          jumlah_salinan?: number
          logo_url?: string | null
          nama_bengkel?: string
          telepon?: string | null
          ukuran_kertas?: number
        }
        Update: {
          alamat?: string | null
          auto_logout_jam?: number
          awalan_nota?: string
          awalan_opname?: string
          awalan_penerimaan?: string
          blind_count?: boolean
          footer_struk?: string | null
          id?: number
          jumlah_salinan?: number
          logo_url?: string | null
          nama_bengkel?: string
          telepon?: string | null
          ukuran_kertas?: number
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          aktif: boolean
          created_at: string
          id: string
          nama: string
          telepon: string | null
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          id?: string
          nama: string
          telepon?: string | null
        }
        Update: {
          aktif?: boolean
          created_at?: string
          id?: string
          nama?: string
          telepon?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      change_log_entries: {
        Row: {
          aksi: string | null
          akun: string | null
          created_at: string | null
          data_baru: Json | null
          data_lama: Json | null
          entitas: string | null
          entitas_id: string | null
          id: number | null
          objek: string | null
          user_id: string | null
        }
        Relationships: []
      }
      last_purchase: {
        Row: {
          dibuat_pada: string | null
          harga_beli: number | null
          nomor: string | null
          product_id: string | null
          supplier: string | null
          supplier_id: string | null
        }
        Relationships: []
      }
      nopol_last_customer: {
        Row: {
          dibuat_pada: string | null
          nama_pelanggan: string | null
          nopol: string | null
          nopol_kunci: string | null
        }
        Relationships: []
      }
      sale_lines: {
        Row: {
          diskon: number | null
          hpp: number | null
          mechanic_id: string | null
          metode_bayar: string | null
          omzet: number | null
          product_id: string | null
          qty: number | null
          sale_id: string | null
          tanggal_nota: string | null
          tipe: string | null
        }
        Relationships: []
      }
      stock_card: {
        Row: {
          alasan: string | null
          created_at: string | null
          hpp_satuan: number | null
          id: number | null
          jenis: string | null
          keterangan: string | null
          nama_akun: string | null
          nomor_dokumen: string | null
          product_id: string | null
          qty: number | null
          qty_keluar: number | null
          qty_masuk: number | null
          ref_id: string | null
          ref_type: string | null
          saldo: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_product_id: string
          p_qty: number
          p_alasan: string
          p_keterangan?: string
          p_harga_beli?: number
        }
        Returns: number
      }
      cancel_opname: {
        Args: {
          p_opname_id: string
        }
        Returns: undefined
      }
      checkout_sale: {
        Args: {
          p_client_id: string
          p_device_id: string
          p_user_id: string
          p_awalan: string
          p_urut: number
          p_dibuat_pada: string
          p_items: Json
          p_metode_bayar: string
          p_total: number
          p_uang_diterima?: number
          p_diskon_nota_jenis?: string
          p_diskon_nota_input?: number
          p_nopol?: string
          p_nama_pelanggan?: string
          p_mechanic_id?: string
          p_catatan_servis?: string
        }
        Returns: Json
      }
      confirm_opname: {
        Args: {
          p_opname_id: string
        }
        Returns: Json
      }
      create_internal_barcode: {
        Args: {
          p_product_id: string
        }
        Returns: string
      }
      create_product: {
        Args: {
          p_tipe: string
          p_nama: string
          p_category_id: string
          p_harga_jual: number
          p_merek?: string
          p_satuan?: string
          p_bisa_pecahan?: boolean
          p_stok_min?: number
          p_barcodes?: string[]
          p_kode_part?: Json
          p_stok_awal?: number
          p_harga_beli?: number
        }
        Returns: string
      }
      create_receipt: {
        Args: {
          p_items: Json
          p_tanggal_faktur?: string
          p_supplier_id?: string
          p_no_faktur?: string
        }
        Returns: Json
      }
      get_last_sale_urut: {
        Args: {
          p_tanggal: string
        }
        Returns: number
      }
      is_active_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      open_opname: {
        Args: {
          p_jenis: string
          p_category_id?: string
        }
        Returns: Json
      }
      record_backup: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      record_opname_count: {
        Args: {
          p_opname_id: string
          p_product_id: string
          p_qty: number
          p_tambah?: boolean
        }
        Returns: number
      }
      register_cashier_device: {
        Args: {
          p_device_id: string
          p_nama?: string
        }
        Returns: string
      }
      report_receiving_by_supplier: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            supplier_id: string | null
            supplier: string | null
            penerimaan: number | null
            total: number | null
          }[]
      }
      report_sales_by_category: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            category_id: string | null
            kategori: string | null
            omzet: number | null
            hpp: number | null
          }[]
      }
      report_sales_by_day: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            tanggal: string | null
            nota: number | null
            omzet_part: number | null
            omzet_jasa: number | null
            diskon: number | null
            hpp: number | null
          }[]
      }
      report_sales_by_method: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            metode_bayar: string | null
            nota: number | null
            total: number | null
          }[]
      }
      report_sales_by_product: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            product_id: string | null
            nama: string | null
            merek: string | null
            tipe: string | null
            kategori: string | null
            qty: number | null
            omzet: number | null
            hpp: number | null
            stok: number | null
          }[]
      }
      report_sales_summary: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            nota: number | null
            kendaraan: number | null
            omzet_part: number | null
            omzet_jasa: number | null
            diskon: number | null
            total: number | null
            hpp: number | null
            void_nota: number | null
            void_total: number | null
          }[]
      }
      report_services_by_mechanic: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            mechanic_id: string | null
            mekanik: string | null
            nota: number | null
            omzet_jasa: number | null
          }[]
      }
      report_stock_value: {
        Args: Record<PropertyKey, never>
        Returns: {
            product_id: string | null
            nama: string | null
            merek: string | null
            kategori: string | null
            satuan: string | null
            stok: number | null
            harga_beli_avg: number | null
            nilai: number | null
            terdaftar_pada: string | null
            terakhir_terjual: string | null
          }[]
      }
      report_stocktake_by_reason: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            alasan: string | null
            qty: number | null
            nilai: number | null
          }[]
      }
      report_stocktake_sessions: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: {
            id: string | null
            nomor: string | null
            jenis: string | null
            kategori: string | null
            dikonfirmasi_pada: string | null
            part_selisih: number | null
            lebih: number | null
            kurang: number | null
          }[]
      }
      review_opname: {
        Args: {
          p_opname_id: string
        }
        Returns: {
            product_id: string | null
            nama: string | null
            merek: string | null
            satuan: string | null
            kategori: string | null
            keputusan: string | null
            qty_hitung: number | null
            dihitung_pada: string | null
            stok_sistem_saat_hitung: number | null
            stok_sekarang: number | null
            selisih: number | null
            harga_beli_avg: number | null
            selisih_rupiah: number | null
            alasan: string | null
            alasan_keterangan: string | null
            harga_beli_input: number | null
            perlu_harga_beli: boolean | null
          }[]
      }
      set_opname_decision: {
        Args: {
          p_opname_id: string
          p_product_ids: string[]
          p_keputusan: string
        }
        Returns: undefined
      }
      set_opname_purchase_price: {
        Args: {
          p_opname_id: string
          p_product_id: string
          p_harga_beli: number
        }
        Returns: undefined
      }
      set_opname_reason: {
        Args: {
          p_opname_id: string
          p_product_ids: string[]
          p_alasan: string
          p_keterangan?: string
        }
        Returns: undefined
      }
      touch_last_login: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      void_receipt: {
        Args: {
          p_receipt_id: string
          p_alasan: string
        }
        Returns: undefined
      }
      void_sale: {
        Args: {
          p_sale_id: string
          p_alasan: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicTables = Database['public']['Tables']
export type TableRow<T extends keyof PublicTables> = PublicTables[T]['Row']
export type TableInsert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type TableUpdate<T extends keyof PublicTables> = PublicTables[T]['Update']
