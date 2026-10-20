import React, { useState, useMemo } from 'react';
import {
  Search,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  Minus,
  RefreshCw,
  Zap,
  ShieldCheck,
  MoreVertical,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Terminal,
  Code2,
  Menu,
} from 'lucide-react';

interface ProductItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  weight_kg: number;
}

interface CsvError {
  row_number: number;
  sku?: string;
  error: string;
}

interface CsvSummary {
  total_rows: number;
  successful_imports: number;
  failed_imports: number;
  errors: CsvError[];
}

interface ConcurrencyResult {
  shopper_id: number;
  status_code: number;
  message: string;
  timestamp: string;
}

const SCRIPT_INJECTION_REGEX =
  /(<\s*\/?\s*(?:script|iframe|object|embed|svg|applet|meta|link|style)[^>]*>|javascript\s*:|on\w+\s*=|data\s*:\s*text\/html|<\s*script)/i;

const SQL_INJECTION_REGEX =
  /(--|\/\*|\*\/|;\s*(?:drop|delete|update|insert|alter|truncate|create|select)\b|\bunion\s+(?:all\s+)?select\b|(?:'|")\s*(?:or|and)\s+(?:'|")?\w+(?:'|")?\s*=\s*(?:'|")?\w+|\bbenchmark\s*\(|\bpg_sleep\s*\()/i;

const SKU_ALLOWED_REGEX = /^[A-Za-z0-9_.\-]+$/;

const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    sku: "KNT-CPU-9950X",
    name: "Ryzen 9 9950X Performance Processor",
    description: "16-core, 32-thread flagship processor with 5.7 GHz boost frequency and 80MB cache.",
    category: "Computing",
    price: 649.99,
    stock: 25,
    weight_kg: 0.280,
  },
  {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    sku: "KNT-GPU-4090FE",
    name: "GeForce RTX 4090 Founders Edition",
    description: "24GB G6X memory, DLSS 3.5, and extreme ray tracing performance for 4K workstation pipelines.",
    category: "Computing",
    price: 1599.00,
    stock: 12,
    weight_kg: 2.150,
  },
  {
    id: "4a821e25-28b9-4a94-8452-f41e57c617b8",
    sku: "KNT-SSD-990PRO4",
    name: "990 PRO NVMe M.2 SSD 4TB",
    description: "PCIe 4.0 interface reaching sequential reads up to 7,450 MB/s with nickel-coated thermal spreader.",
    category: "Storage",
    price: 349.50,
    stock: 40,
    weight_kg: 0.045,
  },
  {
    id: "1b93f218-4e89-49c3-9b22-83b3d9c7921a",
    sku: "KNT-DIS-PROART32",
    name: "ProArt Display 32-inch 4K OLED",
    description: "Professional 3840x2160 true 10-bit monitor with 99% DCI-P3 coverage and hardware calibration.",
    category: "Displays",
    price: 1299.00,
    stock: 8,
    weight_kg: 8.400,
  },
  {
    id: "6e84d284-59e3-4f28-98e3-c21d8b2e15bc",
    sku: "KNT-AUD-DAC-HD",
    name: "High-Res Precision DAC Amp",
    description: "Balanced dual ESS Sabre chips with ultra-low distortion THD+N under 0.0001% and XLR outputs.",
    category: "Audio",
    price: 479.00,
    stock: 18,
    weight_kg: 1.350,
  },
  {
    id: "9f14b620-3b98-44d3-82a1-df6e98b11c34",
    sku: "KNT-PER-MECH80",
    name: "Machined Aluminum TKL Mechanical Keyboard",
    description: "Gasket-mounted hot-swap mechanical keyboard with pre-lubricated linear switches and PBT keycaps.",
    category: "Peripherals",
    price: 189.95,
    stock: 30,
    weight_kg: 1.420,
  },
  {
    id: "2d77b831-7e82-4c28-92a0-410c9d74e223",
    sku: "KNT-NET-10GSFP",
    name: "Dual-Port 10G SFP+ PCIe Network Card",
    description: "Enterprise Intel 82599ES controller supporting jumbo frames, SR-IOV, and optical transceivers.",
    category: "Networking",
    price: 149.00,
    stock: 15,
    weight_kg: 0.310,
  },
  {
    id: "5b66d732-2a91-49c7-81b3-4f0e917d29a5",
    sku: "KNT-RAM-DDR5-64G",
    name: "DDR5-6000 Low Latency 64GB Kit",
    description: "Dual 32GB sticks engineered with anodized aluminum heat spreaders and AMD EXPO / Intel XMP 3.0.",
    category: "Computing",
    price: 219.99,
    stock: 50,
    weight_kg: 0.160,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c01",
    sku: "KNT-CPU-7800X3D",
    name: "Ryzen 7 7800X3D Gaming Processor",
    description: "8-core gaming CPU with 96MB 3D V-Cache architecture providing class-leading frame rate stability.",
    category: "Computing",
    price: 449.00,
    stock: 22,
    weight_kg: 0.280,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c02",
    sku: "KNT-GPU-4080S",
    name: "GeForce RTX 4080 Super 16GB",
    description: "16GB GDDR6X workstation and render card with triple Axial-tech cooling solution.",
    category: "Computing",
    price: 999.00,
    stock: 14,
    weight_kg: 1.880,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c03",
    sku: "KNT-CPU-14900K",
    name: "Core i9-14900K Flagship Processor",
    description: "24-core hybrid architecture with 6.0 GHz Thermal Velocity Boost and PCIe 5.0 lanes.",
    category: "Computing",
    price: 549.99,
    stock: 19,
    weight_kg: 0.290,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c04",
    sku: "KNT-GPU-7900XTX",
    name: "Radeon RX 7900 XTX 24GB",
    description: "RDNA 3 architecture featuring chiplet packaging, DisplayPort 2.1, and 24GB high-speed memory.",
    category: "Computing",
    price: 929.00,
    stock: 11,
    weight_kg: 1.820,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c05",
    sku: "KNT-MB-X670EE",
    name: "ROG Crosshair X670E Hero Motherboard",
    description: "AMD AM5 ATX motherboard with 18+2 power stages, DDR5 support, and dual USB4 ports.",
    category: "Computing",
    price: 629.99,
    stock: 16,
    weight_kg: 2.450,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c06",
    sku: "KNT-MB-Z790MAX",
    name: "MEG Z790 ACE MAX Gaming Motherboard",
    description: "Intel LGA1700 motherboard equipped with Wi-Fi 7, PCIe 5.0 M.2 slots, and robust 24-phase VRM.",
    category: "Computing",
    price: 689.00,
    stock: 10,
    weight_kg: 2.600,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c07",
    sku: "KNT-CASE-O11DXL",
    name: "O11 Dynamic EVO XL Chassis",
    description: "Full tower modular aluminum chassis with reversible layout and support for triple 420mm radiators.",
    category: "Computing",
    price: 239.99,
    stock: 20,
    weight_kg: 16.500,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c08",
    sku: "KNT-PSU-1600T",
    name: "Titanium 1600W Fully Modular ATX 3.0 PSU",
    description: "80 PLUS Titanium certified power supply with native 12VHPWR PCIe Gen5 power cable.",
    category: "Computing",
    price: 499.00,
    stock: 14,
    weight_kg: 3.200,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c09",
    sku: "KNT-COOL-AIO360",
    name: "Kraken Elite 360 RGB Liquid Cooler",
    description: "High-static pressure AIO liquid cooler with customizable 2.36-inch wide-angle LCD display.",
    category: "Computing",
    price: 279.99,
    stock: 25,
    weight_kg: 2.100,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c10",
    sku: "KNT-COOL-NH-D15",
    name: "NH-D15 chromax.black Dual-Tower Air Cooler",
    description: "Six heatpipe dual-radiator air cooler with dual NF-A15 140mm PWM fans for silent cooling.",
    category: "Computing",
    price: 119.95,
    stock: 35,
    weight_kg: 1.320,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c11",
    sku: "KNT-RAM-DDR5-32G",
    name: "Dominator Titanium DDR5-7200 32GB Kit",
    description: "Extreme frequency dual 16GB kit featuring DHX cooling technology and forged aluminum tops.",
    category: "Computing",
    price: 199.99,
    stock: 45,
    weight_kg: 0.170,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c12",
    sku: "KNT-RAM-ECC-128G",
    name: "DDR5-4800 Registered ECC 128GB Quad Kit",
    description: "Server-grade error-correcting memory engineered for workstation and virtualization platforms.",
    category: "Computing",
    price: 749.00,
    stock: 12,
    weight_kg: 0.320,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c13",
    sku: "KNT-SSD-GEN5-2TB",
    name: "Crucial T700 PCIe Gen5 NVMe 2TB SSD",
    description: "Uncapped sequential read speeds up to 12,400 MB/s with extruded aluminum passive heatsink.",
    category: "Storage",
    price: 289.99,
    stock: 28,
    weight_kg: 0.080,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c14",
    sku: "KNT-SSD-GEN5-4TB",
    name: "Crucial T705 PCIe Gen5 NVMe 4TB SSD",
    description: "Flagship 14,500 MB/s transfer speed storage drive for video editing and deep learning datasets.",
    category: "Storage",
    price: 529.99,
    stock: 15,
    weight_kg: 0.085,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c15",
    sku: "KNT-SSD-SN850X-2TB",
    name: "WD_BLACK SN850X NVMe M.2 2TB SSD",
    description: "PCIe 4.0 gaming storage with 7,300 MB/s reads and Game Mode 2.0 predictive caching.",
    category: "Storage",
    price: 169.99,
    stock: 55,
    weight_kg: 0.040,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c16",
    sku: "KNT-SSD-SATA-8TB",
    name: "870 QVO SATA 2.5-inch 8TB Internal SSD",
    description: "High-density SATA III drive providing massive 8TB reliable local backup and media storage.",
    category: "Storage",
    price: 549.99,
    stock: 18,
    weight_kg: 0.090,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c17",
    sku: "KNT-HDD-EXOS-24TB",
    name: "Exos X24 Enterprise SATA 24TB 7200RPM HDD",
    description: "Helium-sealed hyperscale enterprise drive rated for 2.5 million hours MTBF and 550TB/year workload.",
    category: "Storage",
    price: 469.00,
    stock: 24,
    weight_kg: 0.680,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c18",
    sku: "KNT-HDD-IRON-16TB",
    name: "IronWolf Pro NAS Internal 16TB 7200RPM HDD",
    description: "Multi-bay NAS drive engineered with RV sensors and AgileArray firmware for RAID arrays.",
    category: "Storage",
    price: 319.99,
    stock: 32,
    weight_kg: 0.670,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c19",
    sku: "KNT-SSD-EXT-4TB",
    name: "SanDisk Extreme PRO USB 3.2 4TB Rugged SSD",
    description: "IP55 dust and water resistance, aluminum unibody core, with 2000 MB/s read and write speeds.",
    category: "Storage",
    price: 369.99,
    stock: 30,
    weight_kg: 0.120,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c20",
    sku: "KNT-NAS-8BAY",
    name: "DiskStation 8-Bay Quad-Core NAS Enclosure",
    description: "Dual 10GbE networking, M.2 NVMe SSD cache slots, and hardware encryption acceleration.",
    category: "Storage",
    price: 1049.00,
    stock: 9,
    weight_kg: 6.200,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c21",
    sku: "KNT-DIS-OLED48",
    name: "UltraGear 48-inch 4K OLED 138Hz Monitor",
    description: "0.1ms response time, anti-glare low reflection coating, G-SYNC compatible, and HDR10.",
    category: "Displays",
    price: 899.00,
    stock: 14,
    weight_kg: 15.200,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c22",
    sku: "KNT-DIS-UW34",
    name: "Alienware 34 Curved QD-OLED Gaming Monitor",
    description: "175Hz refresh rate, 1800R curvature, Quantum Dot OLED panel with Infinite Contrast ratio.",
    category: "Displays",
    price: 799.99,
    stock: 16,
    weight_kg: 9.800,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c23",
    sku: "KNT-DIS-5KSTUDIO",
    name: "Studio Display 27-inch 5K Retina Screen",
    description: "5120x2880 resolution with 600 nits brightness, P3 wide color, and studio-quality 3-mic array.",
    category: "Displays",
    price: 1599.00,
    stock: 7,
    weight_kg: 6.300,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c24",
    sku: "KNT-DIS-4K144",
    name: "27-inch 4K UHD 144Hz Fast IPS Monitor",
    description: "HDMI 2.1, 1ms GTG response, DisplayHDR 600, with 95% DCI-P3 color gamut coverage.",
    category: "Displays",
    price: 499.99,
    stock: 35,
    weight_kg: 5.700,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c25",
    sku: "KNT-DIS-DUALARM",
    name: "Heavy-Duty Gas Spring Dual Monitor Arm",
    description: "Supports dual 34-inch displays up to 15 kg each with full cable management channels.",
    category: "Displays",
    price: 159.95,
    stock: 40,
    weight_kg: 5.400,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c26",
    sku: "KNT-AUD-MONITOR5",
    name: "LSR305P MkII 5-inch Active Studio Monitor Pair",
    description: "Bi-amplified reference studio monitors with Image Control Waveguide for precise mixing.",
    category: "Audio",
    price: 299.00,
    stock: 22,
    weight_kg: 9.400,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c27",
    sku: "KNT-AUD-HEADPHONE",
    name: "Open-Back Planar Magnetic Reference Headphones",
    description: "Audiophile neodymium planar drivers with lightweight open mesh earcups and balanced 4.4mm cable.",
    category: "Audio",
    price: 599.00,
    stock: 15,
    weight_kg: 0.420,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c28",
    sku: "KNT-AUD-MIC-SM7B",
    name: "Cardioid Dynamic Vocal Broadcast Microphone",
    description: "Wide-range frequency response, bass rolloff, and mid-range emphasis controls for broadcasting.",
    category: "Audio",
    price: 399.00,
    stock: 26,
    weight_kg: 0.760,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c29",
    sku: "KNT-AUD-INT-4PRE",
    name: "4-Channel 192kHz USB-C Audio Interface",
    description: "Discrete microphone preamps with +48V phantom power and dedicated zero-latency direct monitoring.",
    category: "Audio",
    price: 329.99,
    stock: 20,
    weight_kg: 1.150,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c30",
    sku: "KNT-AUD-BOOMARM",
    name: "Low-Profile Broadcast Microphone Boom Arm",
    description: "360-degree rotation all-metal arm with magnetic cable covers and desk clamp mechanism.",
    category: "Audio",
    price: 99.00,
    stock: 45,
    weight_kg: 1.650,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c31",
    sku: "KNT-NET-SWITCH24",
    name: "24-Port Managed Gigabit PoE+ Switch",
    description: "370W PoE budget with 4 10G SFP+ uplink ports and L2+/L3 routing capabilities.",
    category: "Networking",
    price: 499.00,
    stock: 12,
    weight_kg: 4.800,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c32",
    sku: "KNT-NET-ROUTER25",
    name: "Multi-Gigabit Dual WAN VPN Router",
    description: "Hardware IPS/IDS inspection at 2.5Gbps line speed with quad-core enterprise SoC.",
    category: "Networking",
    price: 279.00,
    stock: 24,
    weight_kg: 1.100,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c33",
    sku: "KNT-NET-WIFI7AP",
    name: "Tri-Band WiFi 7 Enterprise Access Point",
    description: "320MHz channel width, 4x4 MU-MIMO, up to 9.3Gbps aggregate wireless throughput.",
    category: "Networking",
    price: 299.99,
    stock: 28,
    weight_kg: 0.820,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c34",
    sku: "KNT-NET-SFP-DAC",
    name: "10G SFP+ Direct Attach Copper Cable 3M",
    description: "Low-latency twinaxial passive cable for rack-to-rack top-of-switch connections.",
    category: "Networking",
    price: 24.50,
    stock: 80,
    weight_kg: 0.180,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c35",
    sku: "KNT-PER-MOUSE8K",
    name: "Ultralight Wireless 8K Polling Gaming Mouse",
    description: "49g magnesium alloy chassis, 30,000 DPI optical sensor, and optical micro switches.",
    category: "Peripherals",
    price: 149.99,
    stock: 40,
    weight_kg: 0.049,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c36",
    sku: "KNT-PER-KEY75",
    name: "75% Wireless CNC Aluminum Mechanical Keyboard",
    description: "Tri-mode connectivity, rotary volume encoder, south-facing RGB, and sound-dampening foam.",
    category: "Peripherals",
    price: 169.00,
    stock: 35,
    weight_kg: 1.250,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c37",
    sku: "KNT-PER-DOCKTB4",
    name: "Thunderbolt 4 Workstation Docking Station",
    description: "Dual 4K@60Hz display support, 98W host charging, 2.5GbE Ethernet, and UHS-II SD reader.",
    category: "Peripherals",
    price: 289.00,
    stock: 22,
    weight_kg: 0.480,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c38",
    sku: "KNT-PER-DESKMAT",
    name: "Cordura Waterproof Extended Desk Mat 900x400mm",
    description: "High-durability stitched edges, micro-textured surface, and natural anti-slip rubber base.",
    category: "Peripherals",
    price: 34.99,
    stock: 65,
    weight_kg: 0.650,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c39",
    sku: "KNT-PER-STREAM15",
    name: "15-Key Customizable LCD Macro Controller",
    description: "One-touch dynamic tactile keys for studio triggering, audio mixing, and workflow shortcuts.",
    category: "Peripherals",
    price: 149.99,
    stock: 30,
    weight_kg: 0.270,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c40",
    sku: "KNT-PER-4KWEBCAM",
    name: "4K HDR Pro Ultra-HD Autofocus Webcam",
    description: "Large 1/1.8-inch Sony STARVIS sensor, stereo beamforming microphones, and privacy shutter.",
    category: "Peripherals",
    price: 199.99,
    stock: 25,
    weight_kg: 0.210,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c41",
    sku: "KNT-CPU-7950X3D",
    name: "Ryzen 9 7950X3D 16-Core Processor",
    description: "Enthusiast workstation and gaming CPU with AMD 3D V-Cache and dual CCD architecture.",
    category: "Computing",
    price: 599.00,
    stock: 18,
    weight_kg: 0.285,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c42",
    sku: "KNT-CPU-14700K",
    name: "Core i7-14700K 20-Core Processor",
    description: "28 threads with up to 5.6 GHz turbo frequency and expanded 33MB Intel Smart Cache.",
    category: "Computing",
    price: 399.99,
    stock: 28,
    weight_kg: 0.290,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c43",
    sku: "KNT-GPU-4070TIS",
    name: "GeForce RTX 4070 Ti Super 16GB",
    description: "AD103 silicon, 256-bit memory bus, 16GB GDDR6X, and dual dual-ball bearing fans.",
    category: "Computing",
    price: 799.00,
    stock: 19,
    weight_kg: 1.450,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c44",
    sku: "KNT-GPU-7800XT",
    name: "Radeon RX 7800 XT 16GB",
    description: "High-FPS 1440p gaming card with 16GB memory and 64MB second-generation AMD Infinity Cache.",
    category: "Computing",
    price: 499.00,
    stock: 25,
    weight_kg: 1.300,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c45",
    sku: "KNT-MB-B650E",
    name: "B650E-I Gaming WiFi Mini-ITX Board",
    description: "PCIe 5.0 x16 graphics slot, PCIe 5.0 M.2, and 10+2 phase 105A power stage design.",
    category: "Computing",
    price: 329.00,
    stock: 14,
    weight_kg: 1.150,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c46",
    sku: "KNT-PSU-1000G",
    name: "Gold 1000W ATX 3.0 Power Supply",
    description: "Native PCIe 5.0 cable, Japanese 105C capacitors, and zero-RPM silent fan curve.",
    category: "Computing",
    price: 179.99,
    stock: 35,
    weight_kg: 2.100,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c47",
    sku: "KNT-COOL-FAN120",
    name: "NF-A12x25 PWM 120mm Quiet Fan 3-Pack",
    description: "Sterrox LCP impeller with 0.5mm tip clearance for optimal static pressure and acoustic profile.",
    category: "Computing",
    price: 99.95,
    stock: 50,
    weight_kg: 0.650,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c48",
    sku: "KNT-RAM-DDR4-64G",
    name: "DDR4-3600 CL16 Dual Channel 64GB Kit",
    description: "Low-latency memory upgrade kit optimized for AMD Ryzen 5000 and Intel 12th gen platforms.",
    category: "Computing",
    price: 139.99,
    stock: 30,
    weight_kg: 0.150,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c49",
    sku: "KNT-SSD-990EVO-2TB",
    name: "990 EVO PCIe 4.0 / 5.0 x2 NVMe 2TB SSD",
    description: "Hybrid interface architecture providing up to 5,000 MB/s speed with superior thermal efficiency.",
    category: "Storage",
    price: 159.00,
    stock: 45,
    weight_kg: 0.040,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c50",
    sku: "KNT-SSD-P5PLUS-1TB",
    name: "Crucial P5 Plus 1TB PCIe 4.0 NVMe SSD",
    description: "Sequential reads up to 6600 MB/s engineered for intensive creative workloads and gaming.",
    category: "Storage",
    price: 89.99,
    stock: 55,
    weight_kg: 0.038,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c51",
    sku: "KNT-SSD-EXT-2TB",
    name: "T9 Portable SSD 2TB USB 3.2 Gen 2x2",
    description: "Up to 2,000 MB/s read/write speeds encased in a thermal-guarded rubberized slipcase.",
    category: "Storage",
    price: 219.99,
    stock: 40,
    weight_kg: 0.110,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c52",
    sku: "KNT-HDD-RED-12TB",
    name: "WD Red Plus 12TB 7200RPM NAS Hard Drive",
    description: "CMR technology with 256MB cache for reliable multi-drive ZFS and RAID storage pools.",
    category: "Storage",
    price: 249.99,
    stock: 30,
    weight_kg: 0.660,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c53",
    sku: "KNT-DIS-QHD240",
    name: "27-inch 1440p 240Hz Fast IPS Esports Monitor",
    description: "0.5ms minimum response time with certified AMD FreeSync Premium Pro and sRGB 99%.",
    category: "Displays",
    price: 379.99,
    stock: 25,
    weight_kg: 5.200,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c54",
    sku: "KNT-DIS-PORTABLE15",
    name: "15.6-inch Full HD OLED Portable Monitor",
    description: "100% DCI-P3 wide color, 10-point capacitive touch, dual USB-C and Mini-HDMI inputs.",
    category: "Displays",
    price: 299.00,
    stock: 35,
    weight_kg: 0.720,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c55",
    sku: "KNT-DIS-BARLIGHT",
    name: "ScreenBar Halo Monitor Light Bar",
    description: "Auto-dimming ambient sensor, wireless desktop rotary dial, and zero-glare optical geometry.",
    category: "Displays",
    price: 179.00,
    stock: 45,
    weight_kg: 0.880,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c56",
    sku: "KNT-AUD-IEM-PRO",
    name: "Quad-Driver Balanced Armature In-Ear Monitors",
    description: "Detachable MMCX silver-plated cable with precision crossover network for stage and mixing.",
    category: "Audio",
    price: 249.00,
    stock: 35,
    weight_kg: 0.080,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c57",
    sku: "KNT-AUD-CLOUDLIFT",
    name: "Single Channel Microphone Preamp Booster",
    description: "+25dB of ultra-clean passive gain for dynamic and ribbon microphones using phantom power.",
    category: "Audio",
    price: 149.00,
    stock: 40,
    weight_kg: 0.350,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c58",
    sku: "KNT-NET-CAT6A-100",
    name: "Cat6A Shielded S/FTP Pure Copper Patch Cable 100M",
    description: "10Gbps rated 500MHz shielded twisted pair bulk cable for structured server rack drops.",
    category: "Networking",
    price: 79.99,
    stock: 50,
    weight_kg: 4.100,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c59",
    sku: "KNT-NET-USB25G",
    name: "USB-C to 2.5GbE Ethernet Adapter",
    description: "RTL8156BG chipset providing full 2500 Mbps throughput over standard RJ-45 cat5e cables.",
    category: "Networking",
    price: 29.99,
    stock: 90,
    weight_kg: 0.060,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c60",
    sku: "KNT-PER-PAD9KEY",
    name: "Wireless Hot-Swap Numeric Macro Pad",
    description: "Full aluminum case with 9 hot-swappable keys, programmable QMK/VIA support, and knob.",
    category: "Peripherals",
    price: 69.99,
    stock: 45,
    weight_kg: 0.380,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c61",
    sku: "KNT-PER-SWITCH-LUBE",
    name: "Mechanical Switch Lubrication & Mod Kit",
    description: "Includes Krytox 205g0 lubricant, brush, stem pick, switch opener, and film sheets.",
    category: "Peripherals",
    price: 24.99,
    stock: 75,
    weight_kg: 0.150,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c62",
    sku: "KNT-CPU-7700X",
    name: "Ryzen 7 7700X 8-Core Desktop Processor",
    description: "High performance Zen 4 processor with 5.4 GHz boost and AMD Radeon integrated graphics.",
    category: "Computing",
    price: 319.00,
    stock: 24,
    weight_kg: 0.280,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c63",
    sku: "KNT-CPU-14600K",
    name: "Core i5-14600K 14-Core Processor",
    description: "Great value desktop CPU featuring 6 Performance-cores and 8 Efficient-cores up to 5.3 GHz.",
    category: "Computing",
    price: 299.99,
    stock: 35,
    weight_kg: 0.285,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c64",
    sku: "KNT-GPU-4060TI",
    name: "GeForce RTX 4060 Ti 16GB Edition",
    description: "16GB VRAM capacity for stable diffusion local model generation and 1080p ultra gaming.",
    category: "Computing",
    price: 449.00,
    stock: 22,
    weight_kg: 0.980,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c65",
    sku: "KNT-GPU-7700XT",
    name: "Radeon RX 7700 XT 12GB",
    description: "12GB GDDR6 on a 192-bit bus with 48 compute units and dual BIOS quiet/performance switch.",
    category: "Computing",
    price: 419.00,
    stock: 20,
    weight_kg: 1.150,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c66",
    sku: "KNT-MB-B760M",
    name: "MAG B760M Mortar WiFi Micro-ATX",
    description: "12+1+1 Duet Rail Power System with DDR5 support and extended VRM heatsinks.",
    category: "Computing",
    price: 189.99,
    stock: 30,
    weight_kg: 1.350,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c67",
    sku: "KNT-PSU-850G",
    name: "SFX 850W Platinum Small Form Factor PSU",
    description: "High density SFX power supply with individually sleeved flexible cables and 92mm FDB fan.",
    category: "Computing",
    price: 189.00,
    stock: 25,
    weight_kg: 1.450,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c68",
    sku: "KNT-COOL-PA120",
    name: "Peerless Assassin 120 SE Dual Tower Cooler",
    description: "AGHP heat pipe technology with dual TL-C12C PWM fans offering top tier value cooling.",
    category: "Computing",
    price: 36.90,
    stock: 60,
    weight_kg: 1.020,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c69",
    sku: "KNT-RAM-DDR5-48G",
    name: "DDR5-6400 48GB (2x24GB) Non-Binary Kit",
    description: "High-density 24GB module ICs engineered for demanding rendering and virtualization nodes.",
    category: "Computing",
    price: 169.99,
    stock: 28,
    weight_kg: 0.160,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c70",
    sku: "KNT-SSD-NVME-500G",
    name: "980 NVMe M.2 500GB Boot Drive",
    description: "DRAM-less HMB technology with 3,100 MB/s sequential read performance for OS partitions.",
    category: "Storage",
    price: 54.99,
    stock: 70,
    weight_kg: 0.035,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c71",
    sku: "KNT-SSD-U2-768T",
    name: "Enterprise U.2 NVMe PCIe 4.0 7.68TB SSD",
    description: "Power loss protection (PLP) with 1 DWPD endurance rating for transaction log databases.",
    category: "Storage",
    price: 899.00,
    stock: 10,
    weight_kg: 0.180,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c72",
    sku: "KNT-DIS-4K60PRO",
    name: "27-inch 4K IPS Ergonomic Office Display",
    description: "TUV eye comfort certified with 65W USB-C PD power delivery and height-adjustable pivot stand.",
    category: "Displays",
    price: 329.99,
    stock: 40,
    weight_kg: 5.600,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c73",
    sku: "KNT-AUD-SUB8",
    name: "Studio Subwoofer 8-inch Powered 100W",
    description: "Acoustic damping ported enclosure with variable low-pass crossover and polarity switch.",
    category: "Audio",
    price: 249.00,
    stock: 18,
    weight_kg: 10.200,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c74",
    sku: "KNT-NET-TRANS-10G",
    name: "10GBASE-SR SFP+ 850nm Multimode Optical Transceiver",
    description: "Hot-pluggable optical module supporting up to 300 meters over OM3 multimode fiber.",
    category: "Networking",
    price: 21.00,
    stock: 120,
    weight_kg: 0.025,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c75",
    sku: "KNT-PER-WRISTREST",
    name: "Solid Walnut Wood Mechanical Keyboard Wrist Rest",
    description: "Ergonomically beveled solid American walnut hardwood with non-slip silicone feet.",
    category: "Peripherals",
    price: 29.99,
    stock: 55,
    weight_kg: 0.350,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c76",
    sku: "KNT-CPU-7600X",
    name: "Ryzen 5 7600X 6-Core 5.3 GHz Processor",
    description: "Budget powerhouse for gaming and programming workstations with 38MB total cache.",
    category: "Computing",
    price: 209.00,
    stock: 45,
    weight_kg: 0.275,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c77",
    sku: "KNT-GPU-4060",
    name: "GeForce RTX 4060 8GB Compact Dual Fan",
    description: "Ultra-efficient 115W TDP ray tracing card engineered for compact mini-ITX enclosures.",
    category: "Computing",
    price: 299.00,
    stock: 35,
    weight_kg: 0.650,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c78",
    sku: "KNT-SSD-M2-ENC",
    name: "Tool-Free M.2 NVMe USB 3.2 Gen2 Enclosure",
    description: "Full aluminum finned heatsink chassis with 10Gbps Realtek RTL9210B bridge chip.",
    category: "Storage",
    price: 28.50,
    stock: 85,
    weight_kg: 0.120,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c79",
    sku: "KNT-DIS-CALIBRATOR",
    name: "Professional Display Colorimeter Sensor",
    description: "Custom optical filters measuring OLED, Mini-LED, and wide-gamut monitors up to 2000 nits.",
    category: "Displays",
    price: 269.00,
    stock: 16,
    weight_kg: 0.280,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c80",
    sku: "KNT-AUD-STANDS",
    name: "Desktop Vibration Isolation Studio Monitor Stands",
    description: "Acoustic decouple desktop stands with 16-degree tilt adjustment and dampening pads.",
    category: "Audio",
    price: 49.99,
    stock: 45,
    weight_kg: 2.100,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c81",
    sku: "KNT-NET-CRIMP-KIT",
    name: "Pass-Through RJ45 Modular Crimper & Tester Kit",
    description: "Heavy-duty ratcheting crimper with cable stripper, punch down tool, and digital continuity tester.",
    category: "Networking",
    price: 44.95,
    stock: 60,
    weight_kg: 0.950,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c82",
    sku: "KNT-PER-COILCABLE",
    name: "Custom Aviator Coiled USB-C Keyboard Cable",
    description: "Double-sleeved paracord and techflex with detachable GX16 4-pin metal aviator connector.",
    category: "Peripherals",
    price: 32.00,
    stock: 70,
    weight_kg: 0.160,
  },
  {
    id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c83",
    sku: "KNT-PER-CLEANKIT",
    name: "Electronics Precision Dust Blower & Cleaning Kit",
    description: "Cordless 90,000 RPM compressed air duster with anti-static brushes and microfiber cloths.",
    category: "Peripherals",
    price: 49.99,
    stock: 65,
    weight_kg: 0.480,
  },
];

export default function App() {
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'storefront' | 'concurrency' | 'architecture'>('storefront');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(12);

  const [activeCardMenuId, setActiveCardMenuId] = useState<string | null>(null);

  const [editModalProduct, setEditModalProduct] = useState<ProductItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    weight_kg: '',
    description: '',
  });
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [editSuccessProduct, setEditSuccessProduct] = useState<ProductItem | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    sku: '',
    name: '',
    category: '',
    price: '',
    stock: '',
    weight_kg: '',
    description: '',
  });
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [createSuccessProduct, setCreateSuccessProduct] = useState<ProductItem | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  const [deleteModalProduct, setDeleteModalProduct] = useState<ProductItem | null>(null);
  const [deleteSuccessProduct, setDeleteSuccessProduct] = useState<{ name: string; sku: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [purchaseModalProduct, setPurchaseModalProduct] = useState<ProductItem | null>(null);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchaseStatus, setPurchaseStatus] = useState<{ success: boolean; message: string; remaining?: number } | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvSummary, setCsvSummary] = useState<CsvSummary | null>(null);
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [selectedCsvContent, setSelectedCsvContent] = useState<string | null>(null);

  const [simulatedStock, setSimulatedStock] = useState(3);
  const [simulatedShoppers, setSimulatedShoppers] = useState(10);
  const [concurrencyRunning, setConcurrencyRunning] = useState(false);
  const [concurrencyLogs, setConcurrencyLogs] = useState<ConcurrencyResult[]>([]);
  const [concurrencySummary, setConcurrencySummary] = useState<{ success: number; conflict: number } | null>(null);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category))).sort();
    return ['All', ...cats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        p.category.trim().toLowerCase() === selectedCategory.trim().toLowerCase();
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [products, selectedCategory, searchQuery]);

  const totalPages = useMemo(() => {
    if (pageSize === -1) return 1;
    return Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  }, [filteredProducts.length, pageSize]);

  const safeCurrentPage = useMemo(() => {
    if (currentPage > totalPages) return totalPages;
    if (currentPage < 1) return 1;
    return currentPage;
  }, [currentPage, totalPages]);

  const paginatedProducts = useMemo(() => {
    if (pageSize === -1) return filteredProducts;
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredProducts.slice(startIndex, startIndex + pageSize);
  }, [filteredProducts, safeCurrentPage, pageSize]);

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleOpenPurchase = (product: ProductItem) => {
    setActiveCardMenuId(null);
    setPurchaseModalProduct(product);
    setPurchaseQty(1);
    setPurchaseStatus(null);
  };

  const handleExecutePurchase = () => {
    if (!purchaseModalProduct) return;
    setIsPurchasing(true);

    setTimeout(() => {
      const current = products.find((p) => p.id === purchaseModalProduct.id);
      if (!current) {
        setPurchaseStatus({
          success: false,
          message: `Product ${purchaseModalProduct.sku} not found.`,
        });
        setIsPurchasing(false);
        return;
      }

      if (current.stock < purchaseQty) {
        setPurchaseStatus({
          success: false,
          message: `Insufficient stock: requested ${purchaseQty}, but only ${current.stock} units remain.`,
        });
        setIsPurchasing(false);
        return;
      }

      const updatedStock = current.stock - purchaseQty;
      setProducts((prev) =>
        prev.map((p) => (p.id === current.id ? { ...p, stock: updatedStock } : p))
      );
      setPurchaseModalProduct((prev) => (prev ? { ...prev, stock: updatedStock } : null));

      setPurchaseStatus({
        success: true,
        remaining: updatedStock,
        message: `Transaction authorized. Charged $${(purchaseModalProduct.price * purchaseQty).toFixed(2)} for ${purchaseQty} unit(s).`,
      });
      setIsPurchasing(false);
    }, 280);
  };

  const handleOpenCreate = () => {
    setActiveCardMenuId(null);
    setCreateForm({
      sku: '',
      name: '',
      category: '',
      price: '',
      stock: '',
      weight_kg: '',
      description: '',
    });
    setCreateFormError(null);
    setCreateSuccessProduct(null);
    setIsSubmittingCreate(false);
    setCreateModalOpen(true);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateFormError(null);
    setCreateSuccessProduct(null);

    const trimmedSku = createForm.sku.trim().toUpperCase();
    if (!trimmedSku || trimmedSku.length < 3 || trimmedSku.length > 64) {
      setCreateFormError('SKU must be between 3 and 64 characters.');
      return;
    }
    if (!SKU_ALLOWED_REGEX.test(trimmedSku)) {
      setCreateFormError('SKU contains invalid characters. Only alphanumeric, hyphen, underscore, and dot are permitted.');
      return;
    }
    const skuSecurity = validateTextSecurity(trimmedSku, 'SKU');
    if (skuSecurity) {
      setCreateFormError(skuSecurity);
      return;
    }
    if (products.some((p) => p.sku.toUpperCase() === trimmedSku)) {
      setCreateFormError(`Product with SKU "${trimmedSku}" already exists. Please choose a different SKU.`);
      return;
    }

    const trimmedName = createForm.name.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 255) {
      setCreateFormError('Product name must be between 2 and 255 characters.');
      return;
    }
    const nameSecurity = validateTextSecurity(trimmedName, 'name');
    if (nameSecurity) {
      setCreateFormError(nameSecurity);
      return;
    }

    const trimmedCategory = createForm.category.trim();
    if (!trimmedCategory || trimmedCategory.length < 2 || trimmedCategory.length > 100) {
      setCreateFormError('Category must be between 2 and 100 characters.');
      return;
    }
    const categorySecurity = validateTextSecurity(trimmedCategory, 'category');
    if (categorySecurity) {
      setCreateFormError(categorySecurity);
      return;
    }

    const priceNum = parseFloat(createForm.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setCreateFormError('Price must be a valid non-negative number.');
      return;
    }

    const stockNum = parseInt(createForm.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setCreateFormError('Stock must be a valid non-negative integer.');
      return;
    }

    const weightNum = parseFloat(createForm.weight_kg);
    if (isNaN(weightNum) || weightNum < 0) {
      setCreateFormError('Weight must be a valid non-negative number.');
      return;
    }

    const trimmedDesc = createForm.description.trim();
    if (trimmedDesc) {
      if (trimmedDesc.length > 2000) {
        setCreateFormError('Description cannot exceed 2000 characters.');
        return;
      }
      const descSecurity = validateTextSecurity(trimmedDesc, 'description');
      if (descSecurity) {
        setCreateFormError(descSecurity);
        return;
      }
    }

    setIsSubmittingCreate(true);

    const newProduct: ProductItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}`,
      sku: trimmedSku,
      name: trimmedName,
      category: trimmedCategory,
      price: priceNum,
      stock: stockNum,
      weight_kg: weightNum,
      description: trimmedDesc,
    };

    setProducts((prev) => [newProduct, ...prev]);
    setCreateSuccessProduct(newProduct);
    setCreateFormError(null);
    setIsSubmittingCreate(false);

    setCreateForm({
      sku: '',
      name: '',
      category: '',
      price: '',
      stock: '',
      weight_kg: '',
      description: '',
    });
  };

  const handleContinueCreate = () => {
    setCreateSuccessProduct(null);
    setCreateFormError(null);
    setCreateModalOpen(false);
    setCurrentPage(1);
  };

  const handleOpenEdit = (product: ProductItem) => {
    setActiveCardMenuId(null);
    setEditModalProduct(product);
    setEditSuccessProduct(null);
    setEditForm({
      name: product.name,
      category: product.category,
      price: product.price.toString(),
      stock: product.stock.toString(),
      weight_kg: product.weight_kg.toString(),
      description: product.description || '',
    });
    setEditFormError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalProduct) return;

    if (!editForm.name.trim()) {
      setEditFormError('Product name is required.');
      return;
    }
    const nameSecurity = validateTextSecurity(editForm.name, 'name');
    if (nameSecurity) {
      setEditFormError(nameSecurity);
      return;
    }

    if (!editForm.category.trim()) {
      setEditFormError('Category is required.');
      return;
    }
    const categorySecurity = validateTextSecurity(editForm.category, 'category');
    if (categorySecurity) {
      setEditFormError(categorySecurity);
      return;
    }

    if (editForm.description.trim()) {
      const descSecurity = validateTextSecurity(editForm.description, 'description');
      if (descSecurity) {
        setEditFormError(descSecurity);
        return;
      }
    }

    const priceNum = parseFloat(editForm.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setEditFormError('Price must be a valid non-negative number.');
      return;
    }

    const stockNum = parseInt(editForm.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setEditFormError('Stock must be a valid non-negative integer.');
      return;
    }

    const weightNum = parseFloat(editForm.weight_kg);
    if (isNaN(weightNum) || weightNum < 0) {
      setEditFormError('Weight must be a valid non-negative number.');
      return;
    }

    const updatedProduct: ProductItem = {
      ...editModalProduct,
      name: editForm.name.trim(),
      category: editForm.category.trim(),
      price: priceNum,
      stock: stockNum,
      weight_kg: weightNum,
      description: editForm.description.trim(),
    };

    setProducts((prev) =>
      prev.map((p) => (p.id === editModalProduct.id ? updatedProduct : p))
    );

    setEditSuccessProduct(updatedProduct);
    setEditFormError(null);
  };

  const handleContinueEdit = () => {
    setEditModalProduct(null);
    setEditSuccessProduct(null);
    setEditFormError(null);
  };

  const handleOpenDelete = (product: ProductItem) => {
    setActiveCardMenuId(null);
    setDeleteModalProduct(product);
    setDeleteSuccessProduct(null);
    setIsDeleting(false);
  };

  const handleConfirmDelete = () => {
    if (!deleteModalProduct) return;
    setIsDeleting(true);

    const deletedItem = {
      name: deleteModalProduct.name,
      sku: deleteModalProduct.sku,
    };

    setProducts((prev) => prev.filter((p) => p.id !== deleteModalProduct.id));

    if (purchaseModalProduct?.id === deleteModalProduct.id) {
      setPurchaseModalProduct(null);
    }

    fetch(`/api/products/${deleteModalProduct.id}`, {
      method: 'DELETE',
    }).catch(() => {});

    setDeleteSuccessProduct(deletedItem);
    setIsDeleting(false);
  };

  const handleContinueDelete = () => {
    setDeleteModalProduct(null);
    setDeleteSuccessProduct(null);
    setIsDeleting(false);
  };

  const validateTextSecurity = (text: string, fieldName: string): string | null => {
    if (!text) return null;
    if (SCRIPT_INJECTION_REGEX.test(text)) {
      return `Script injection detected in ${fieldName}: input contains disallowed HTML or script tags.`;
    }
    if (SQL_INJECTION_REGEX.test(text)) {
      return `SQL injection pattern detected in ${fieldName}: input contains disallowed SQL syntax.`;
    }
    return null;
  };

  const handleCsvUpload = (fileContent: string) => {
    const lines = fileContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      setCsvSummary({
        total_rows: 0,
        successful_imports: 0,
        failed_imports: 1,
        errors: [{ row_number: 1, error: 'CSV file is empty or missing content.' }],
      });
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const required = ['sku', 'name', 'category', 'price', 'stock', 'weight_kg'];
    const missing = required.filter((r) => !headers.includes(r));

    if (missing.length > 0) {
      setCsvSummary({
        total_rows: 0,
        successful_imports: 0,
        failed_imports: 1,
        errors: [
          {
            row_number: 1,
            error: `Missing required columns: ${missing.join(', ')}`,
          },
        ],
      });
      return;
    }

    const errors: CsvError[] = [];
    const newItems: ProductItem[] = [];
    const seenSkus = new Set<string>();
    const existingSkus = new Set(products.map((p) => p.sku.toUpperCase()));

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      if (values.length < headers.length) continue;

      const rowMap: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowMap[h] = values[idx] || '';
      });

      const sku = rowMap['sku']?.toUpperCase() || '';
      const name = rowMap['name'] || '';
      const description = rowMap['description'] || '';
      const category = rowMap['category'] || '';
      const price = parseFloat(rowMap['price']);
      const stock = parseInt(rowMap['stock'], 10);
      const weight_kg = parseFloat(rowMap['weight_kg']);

      if (!sku) {
        errors.push({ row_number: i + 1, error: 'SKU is required.' });
        continue;
      }

      const skuSecurityError = validateTextSecurity(sku, 'sku');
      if (skuSecurityError) {
        errors.push({ row_number: i + 1, sku, error: skuSecurityError });
        continue;
      }

      if (!SKU_ALLOWED_REGEX.test(sku)) {
        errors.push({
          row_number: i + 1,
          sku,
          error: 'SKU contains invalid characters. Only alphanumeric, hyphen, underscore, and dot are permitted.',
        });
        continue;
      }

      if (seenSkus.has(sku)) {
        errors.push({
          row_number: i + 1,
          sku,
          error: `Duplicate SKU '${sku}' found within file.`,
        });
        continue;
      }

      if (existingSkus.has(sku)) {
        errors.push({
          row_number: i + 1,
          sku,
          error: `SKU '${sku}' already exists in catalog database.`,
        });
        continue;
      }

      if (!name) {
        errors.push({ row_number: i + 1, sku, error: 'Product name is required.' });
        continue;
      }

      const nameSecurityError = validateTextSecurity(name, 'name');
      if (nameSecurityError) {
        errors.push({ row_number: i + 1, sku, error: nameSecurityError });
        continue;
      }

      if (!category) {
        errors.push({ row_number: i + 1, sku, error: 'Category is required.' });
        continue;
      }

      const categorySecurityError = validateTextSecurity(category, 'category');
      if (categorySecurityError) {
        errors.push({ row_number: i + 1, sku, error: categorySecurityError });
        continue;
      }

      if (description) {
        const descSecurityError = validateTextSecurity(description, 'description');
        if (descSecurityError) {
          errors.push({ row_number: i + 1, sku, error: descSecurityError });
          continue;
        }
      }

      if (isNaN(price) || price < 0) {
        errors.push({
          row_number: i + 1,
          sku,
          error: `Invalid price '${rowMap['price']}'. Must be non-negative.`,
        });
        continue;
      }
      if (isNaN(stock) || stock < 0) {
        errors.push({
          row_number: i + 1,
          sku,
          error: `Invalid stock '${rowMap['stock']}'. Must be non-negative integer.`,
        });
        continue;
      }
      if (isNaN(weight_kg) || weight_kg < 0) {
        errors.push({
          row_number: i + 1,
          sku,
          error: `Invalid weight_kg '${rowMap['weight_kg']}'. Must be non-negative.`,
        });
        continue;
      }

      seenSkus.add(sku);
      newItems.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${i}`,
        sku,
        name,
        description,
        category,
        price,
        stock,
        weight_kg,
      });
    }

    if (newItems.length > 0) {
      setProducts((prev) => [...prev, ...newItems]);
    }

    setCsvSummary({
      total_rows: lines.length - 1,
      successful_imports: newItems.length,
      failed_imports: errors.length,
      errors,
    });
  };

  const handleDownloadSampleCsv = () => {
    const csvContent =
      "sku,name,description,category,price,stock,weight_kg\n" +
      "KNT-MON-4K144,4K 144Hz Gaming Monitor,IPS 1ms HDR600 FreeSync Premium Pro,Displays,699.99,15,6.800\n" +
      "KNT-KEY-WIRELESS,Low-Profile Wireless Mechanical Keyboard,Bluetooth 5.2 and 2.4GHz with red linear switches,Peripherals,129.50,45,0.720\n" +
      "KNT-MIC-STUDIO,Broadcast USB-C Condenser Microphone,Cardioid pickup with internal pop filter and shockmount,Audio,159.00,20,0.880\n" +
      "KNT-SSD-2TB-GEN5,PCIe Gen5 NVMe SSD 2TB,Up to 12000 MB/s sequential transfer with heatsink,Storage,279.99,30,0.085\n" +
      "KNT-CASE-ITX,Sandblasted Mini-ITX SFF Case,CNC-milled anodized aluminum chassis with PCIe 4.0 riser cable,Computing,199.00,10,4.250\n" +
      "KNT-RAM-32G-KIT,DDR5-5600 32GB Desktop Memory Kit,High efficiency low profile heat spreader,Computing,119.99,60,0.110\n" +
      "KNT-MOU-OPTICAL,Ergonomic 8K Optical Gaming Mouse,PAW3395 sensor with 26000 DPI and PTFE skates,Peripherals,89.00,35,0.065";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_products.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTestInjectionBatch = () => {
    const maliciousCsv =
      "sku,name,description,category,price,stock,weight_kg\n" +
      "KNT-SEC-CLEAN,Enterprise Server Rack,42U standard steel chassis,Networking,899.00,10,65.0\n" +
      "KNT-XSS-1,<script>alert('xss')</script>,Cross site scripting attempt,Computing,120.00,5,1.2\n" +
      "KNT-XSS-2,Innocent Device,<img src=x onerror=alert(1)>,Audio,55.00,12,0.4\n" +
      "KNT-SQL-1,Device'; DROP TABLE products; --,SQL drop injection,Storage,240.00,8,0.2\n" +
      "KNT-SQL-2,Smart Card,UNION SELECT * FROM passwords,Security,45.00,20,0.1\n" +
      "KNT-SQL-3,Hardware Key,Protected device,' OR '1'='1',Security,75.00,15,0.05";
    handleCsvUpload(maliciousCsv);
  };

  const handleRunConcurrencySimulation = () => {
    setConcurrencyRunning(true);
    setConcurrencyLogs([]);
    setConcurrencySummary(null);

    let currentStock = simulatedStock;
    const totalRequests = simulatedShoppers;
    let successCount = 0;
    let conflictCount = 0;

    const runSimulation = async () => {
      const promises = Array.from({ length: totalRequests }, (_, idx) => {
        const shopperId = idx + 1;
        const delay = Math.floor(Math.random() * 60);

        return new Promise<ConcurrencyResult>((resolve) => {
          setTimeout(() => {
            const now = new Date().toISOString().substring(11, 23);
            if (currentStock >= 1) {
              currentStock -= 1;
              successCount++;
              resolve({
                shopper_id: shopperId,
                status_code: 200,
                message: `Row lock granted. Purchased 1 unit. Remaining stock: ${currentStock}`,
                timestamp: now,
              });
            } else {
              conflictCount++;
              resolve({
                shopper_id: shopperId,
                status_code: 409,
                message: `InsufficientStockException: Available stock is 0. Rollback triggered.`,
                timestamp: now,
              });
            }
          }, delay);
        });
      });

      const batchResults = await Promise.all(promises);
      setConcurrencyLogs(batchResults);
      setConcurrencySummary({ success: successCount, conflict: conflictCount });
      setSimulatedStock(currentStock);
      setConcurrencyRunning(false);
    };

    runSimulation();
  };

  return (
    <div
      onClick={() => {
        if (activeCardMenuId) setActiveCardMenuId(null);
      }}
      className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white"
    >
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-8">
            <button
              onClick={() => {
                setActiveTab('storefront');
                setCurrentPage(1);
              }}
              className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-blue-400 transition-colors text-left"
            >
              E-COMMERCE APP
            </button>

            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
              <button
                onClick={() => setActiveTab('storefront')}
                className={`transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'storefront' ? 'text-white font-semibold' : 'hover:text-white text-slate-400'
                }`}
              >
                Catalog
              </button>
              <button
                onClick={() => setActiveTab('concurrency')}
                className={`transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'concurrency' ? 'text-white font-semibold' : 'hover:text-white text-slate-400'
                }`}
              >
                Concurrency Simulator
              </button>
              <button
                onClick={() => setActiveTab('architecture')}
                className={`transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'architecture' ? 'text-white font-semibold' : 'hover:text-white text-slate-400'
                }`}
              >
                Architecture
              </button>
              <a
                href="/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors whitespace-nowrap shrink-0 text-slate-400"
              >
                API Docs
              </a>
            </nav>

            <div className="flex md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 focus:outline-none"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-800 bg-slate-900/95 px-4 pt-2 pb-4 space-y-2">
            <button
              onClick={() => {
                setActiveTab('storefront');
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-sm font-medium text-slate-200 hover:text-white"
            >
              Catalog
            </button>
            <button
              onClick={() => {
                setActiveTab('concurrency');
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-sm font-medium text-slate-200 hover:text-white"
            >
              Concurrency Simulator
            </button>
            <button
              onClick={() => {
                setActiveTab('architecture');
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-sm font-medium text-slate-200 hover:text-white"
            >
              Architecture
            </button>
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left py-2 text-sm font-medium text-slate-200 hover:text-white"
            >
              API Docs
            </a>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'storefront' && (
          <section>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-800 mb-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Products catalog
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Enterprise hardware catalog with real-time inventory and row-level locking
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create product</span>
                </button>

                <button
                  onClick={() => {
                    setCsvModalOpen(true);
                    setCsvSummary(null);
                    setSelectedCsvFile(null);
                    setSelectedCsvContent(null);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span>Upload CSV</span>
                </button>

                <button
                  onClick={handleDownloadSampleCsv}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-400" />
                  <span>Sample CSV</span>
                </button>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by SKU, model name, specification, or category..."
                  className="block w-full pl-11 pr-11 py-3 text-sm text-white placeholder-slate-500 bg-slate-900/90 border border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white transition-colors"
                    aria-label="Clear search input"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin flex-1 min-w-0">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 pr-1">
                    Category:
                  </span>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => handleCategoryChange(cat)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                          : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800/80'
                      }`}
                    >
                      {cat === 'All' ? 'All Items' : cat}
                    </button>
                  ))}
                </div>

                {(selectedCategory !== 'All' || searchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedCategory('All');
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="text-xs text-slate-400 hover:text-white shrink-0 px-2.5 py-1 rounded hover:bg-slate-900 transition-colors"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <p className="text-xs text-slate-400">
                Showing{' '}
                <span className="font-mono text-slate-200">
                  {filteredProducts.length === 0
                    ? 0
                    : pageSize === -1
                    ? `1–${filteredProducts.length}`
                    : `${(safeCurrentPage - 1) * pageSize + 1}–${Math.min(
                        safeCurrentPage * pageSize,
                        filteredProducts.length
                      )}`}
                </span>{' '}
                of <span className="font-mono text-slate-200">{filteredProducts.length}</span> matching products{' '}
                {filteredProducts.length !== products.length && (
                  <span className="text-slate-500">
                    (Total catalog: <span className="font-mono text-slate-300">{products.length}</span> items)
                  </span>
                )}
              </p>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Per Page:</span>
                <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                  {[12, 24, 48, -1].map((size) => (
                    <button
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        pageSize === size
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {size === -1 ? 'All' : size}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {paginatedProducts.length > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {paginatedProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition-all duration-200 hover:border-slate-700 hover:shadow-lg hover:shadow-blue-950/20 relative"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="tracking-wider uppercase font-medium text-slate-400 truncate">
                              {product.category}
                            </span>
                            <span aria-hidden="true">&middot;</span>
                            <span className="font-mono text-slate-400 truncate">{product.sku}</span>
                          </div>

                          <div className="relative ml-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCardMenuId(activeCardMenuId === product.id ? null : product.id);
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                              aria-label="Product options"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {activeCardMenuId === product.id && (
                              <div
                                className="absolute right-0 mt-1 w-36 rounded-lg bg-slate-950 border border-slate-800 py-1 shadow-2xl z-30"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(product)}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-900 transition-colors text-left"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-blue-400" />
                                  <span>Edit Product</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenDelete(product)}
                                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition-colors text-left"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                  <span>Delete Product</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <h3 className="text-base font-semibold text-white tracking-tight leading-snug mb-2">
                          {product.name}
                        </h3>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-4">
                          {product.description}
                        </p>

                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                          <span>
                            Weight:{' '}
                            <strong className="font-mono text-slate-300 font-normal">
                              {product.weight_kg.toFixed(3)} kg
                            </strong>
                          </span>
                          <span aria-hidden="true">&middot;</span>
                          <span>
                            Stock:{' '}
                            {product.stock > 10 ? (
                              <strong className="font-mono text-emerald-400 font-semibold">
                                {product.stock} units
                              </strong>
                            ) : product.stock > 0 ? (
                              <strong className="font-mono text-amber-400 font-semibold">
                                {product.stock} left
                              </strong>
                            ) : (
                              <strong className="font-mono text-rose-400 font-semibold">
                                Out of Stock
                              </strong>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-xs text-slate-500 block">Unit Price</span>
                          <span className="text-lg font-bold font-mono text-white tracking-tight">
                            ${product.price.toFixed(2)}
                          </span>
                        </div>

                        {product.stock > 0 ? (
                          <button
                            onClick={() => handleOpenPurchase(product)}
                            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 active:scale-95 transition-all whitespace-nowrap shadow-sm shadow-blue-500/20"
                          >
                            Buy Now
                          </button>
                        ) : (
                          <button
                            disabled
                            className="px-3.5 py-2 text-xs font-medium text-slate-500 bg-slate-800/60 rounded-lg cursor-not-allowed whitespace-nowrap"
                          >
                            Sold Out
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {pageSize !== -1 && totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
                    <p className="text-xs text-slate-400">
                      Page <span className="font-mono text-slate-200">{safeCurrentPage}</span> of{' '}
                      <span className="font-mono text-slate-200">{totalPages}</span>
                    </p>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={safeCurrentPage <= 1}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safeCurrentPage <= 1}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          if (totalPages <= 7) return true;
                          if (page === 1 || page === totalPages) return true;
                          return Math.abs(page - safeCurrentPage) <= 1;
                        })
                        .map((page, idx, arr) => {
                          const prev = arr[idx - 1];
                          const showEllipsis = prev && page - prev > 1;

                          return (
                            <React.Fragment key={page}>
                              {showEllipsis && (
                                <span className="px-2 text-xs text-slate-600">...</span>
                              )}
                              <button
                                onClick={() => setCurrentPage(page)}
                                className={`min-w-8 h-8 px-2 text-xs font-mono font-medium rounded-lg transition-colors ${
                                  safeCurrentPage === page
                                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                                    : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        })}

                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={safeCurrentPage >= totalPages}
                        className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Last page"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">
                  No products match your criteria
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
                  Try searching for another hardware specification or clear the active category filter.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                    setCurrentPage(1);
                  }}
                  className="inline-flex px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </section>
        )}

        {activeTab === 'concurrency' && (
          <section className="space-y-6">
            <div className="border-b border-slate-800 pb-6">
              <p className="text-xs font-semibold tracking-wider uppercase text-blue-500 mb-1">
                Transactional Concurrency Testing
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Race Condition & Row-Locking Simulator
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                Demonstrates how <code className="text-blue-400 font-mono">SELECT ... FOR UPDATE</code> prevents overselling under heavy concurrency. Simulates multiple simultaneous purchase requests executed via <code className="text-blue-400 font-mono">asyncio.gather()</code>.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span>Simulation Parameters</span>
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Available Inventory Units
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={simulatedStock}
                    onChange={(e) => setSimulatedStock(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Starting product stock in the database table.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Simultaneous Checkout Shoppers
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={simulatedShoppers}
                    onChange={(e) => setSimulatedShoppers(Math.max(2, parseInt(e.target.value) || 2))}
                    className="w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Number of concurrent tasks fired simultaneously.</p>
                </div>

                <div className="rounded-lg bg-slate-950 p-3.5 border border-slate-800/80 text-xs text-slate-400 space-y-1">
                  <span className="font-semibold text-slate-300 block">Pessimistic Locking Policy:</span>
                  <p>Each checkout task executes an atomic transaction with row locking.</p>
                  <p className="font-mono text-emerald-400">Stock &gt;= Quantity &rarr; Deduct & Commit (200)</p>
                  <p className="font-mono text-rose-400">Stock &lt; Quantity &rarr; Abort & Rollback (409)</p>
                </div>

                <button
                  onClick={handleRunConcurrencySimulation}
                  disabled={concurrencyRunning}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                >
                  <RefreshCw className={`w-4 h-4 ${concurrencyRunning ? 'animate-spin' : ''}`} />
                  <span>{concurrencyRunning ? 'Executing Transactions...' : 'Run Concurrency Test'}</span>
                </button>
              </div>

              <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-blue-400" />
                      <span>Live Transaction Execution Log</span>
                    </h3>
                    {concurrencySummary && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-emerald-400 font-medium">
                          {concurrencySummary.success} Succeeded (200)
                        </span>
                        <span className="text-slate-600">&middot;</span>
                        <span className="text-rose-400 font-medium">
                          {concurrencySummary.conflict} Blocked (409)
                        </span>
                      </div>
                    )}
                  </div>

                  {concurrencyLogs.length > 0 ? (
                    <div className="max-h-96 overflow-y-auto space-y-2 font-mono text-xs pr-2">
                      {concurrencyLogs.map((log) => (
                        <div
                          key={log.shopper_id}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${
                            log.status_code === 200
                              ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                              : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">
                              Task #{log.shopper_id}
                            </span>
                            <span className="font-semibold">
                              {log.status_code === 200 ? 'HTTP 200 OK' : 'HTTP 409 CONFLICT'}
                            </span>
                            <span className="hidden sm:inline opacity-80">&middot; {log.message}</span>
                          </div>
                          <span className="text-[10px] opacity-60 shrink-0">{log.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500">
                      <Zap className="w-8 h-8 mb-2 opacity-40 text-blue-400" />
                      <p className="text-xs">Click &quot;Run Concurrency Test&quot; to fire simultaneous purchase requests.</p>
                    </div>
                  )}
                </div>

                {concurrencySummary && (
                  <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                    <span>
                      Invariant Verified: Total sales strictly bounded by initial stock. Zero overselling.
                    </span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      Final Stock: {simulatedStock}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'architecture' && (
          <section className="space-y-6">
            <div className="border-b border-slate-800 pb-6">
              <p className="text-xs font-semibold tracking-wider uppercase text-blue-500 mb-1">
                Architecture & Security Hardening
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Pragmatic Layered Monolith Architecture
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                Ready for production deployment via <code className="text-blue-400 font-mono">docker compose up --build</code>. Includes comprehensive script injection (XSS) and SQL injection filters on bulk loading.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Security & Injection Validation</span>
                </h3>
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                    <p className="font-mono font-semibold text-emerald-400">Script Injection (XSS) Defense</p>
                    <p className="text-slate-400 mt-0.5">
                      Explicit regex rejection of HTML tags (&lt;script&gt;, &lt;iframe&gt;, &lt;svg&gt;, &lt;object&gt;), javascript: protocols, and event handlers (onerror=, onload=) on SKU, name, description, and category.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                    <p className="font-mono font-semibold text-emerald-400">SQL Injection Pattern Defense</p>
                    <p className="text-slate-400 mt-0.5">
                      Defense-in-depth pattern matching rejecting comment delimiters (-- and /* */), statement chains (; DROP, ; UPDATE), UNION SELECT clauses, and tautologies (&apos; OR 1=1).
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                    <p className="font-mono font-semibold text-blue-400">SKU Whitelist Format</p>
                    <p className="text-slate-400 mt-0.5">
                      Strict alphanumeric, hyphen, underscore, and dot character constraint (<code className="text-slate-200">^[A-Za-z0-9_.-]+$</code>).
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-blue-400" />
                  <span>Automated Pytest Suite</span>
                </h3>
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                    <p className="font-mono font-semibold text-emerald-400">tests/test_crud.py</p>
                    <p className="text-slate-400 mt-0.5">
                      Validates product creation, SKU uniqueness, input validation constraints, search queries, updates, and deletion.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                    <p className="font-mono font-semibold text-emerald-400">tests/test_csv_import.py</p>
                    <p className="text-slate-400 mt-0.5">
                      Tests batch CSV file upload, detects malformed rows, handles internal duplicate SKUs, and explicitly rejects script and SQL injection attempts.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                    <p className="font-mono font-semibold text-emerald-400">tests/test_concurrency.py</p>
                    <p className="text-slate-400 mt-0.5">
                      Uses <code className="text-slate-200">asyncio.gather()</code> to fire 10 simultaneous purchases on 3 stock units, asserting exactly 3 succeed and 7 return 409.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs text-blue-300">
                    <p className="font-semibold text-blue-200">Execute Stack with Docker:</p>
                    <code className="block mt-1 font-mono text-white bg-slate-950 px-2 py-1 rounded">
                      docker compose up --build
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p>E-Commerce App &middot; Enterprise Monolith &middot; PostgreSQL Async &middot; SQLAlchemy 2.0</p>
          <p className="font-mono tabular-nums">Stock Row Locking Engine &middot; Active</p>
        </div>
      </footer>

      {createModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={createSuccessProduct ? handleContinueCreate : () => setCreateModalOpen(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div
              className="relative transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left shadow-2xl transition-all w-full max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-blue-400">
                    Inventory Catalog
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">
                    {createSuccessProduct ? 'Product Created Successfully' : 'Create New Product'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {createSuccessProduct
                      ? 'The product has been successfully registered in the inventory catalog.'
                      : 'Add a new item with security-hardened validation'}
                  </p>
                </div>
                <button
                  onClick={createSuccessProduct ? handleContinueCreate : () => setCreateModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close create modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {createSuccessProduct ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-200 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-emerald-300">
                        Product &quot;{createSuccessProduct.name}&quot; created successfully!
                      </p>
                      <p className="text-emerald-300/80">
                        SKU <span className="font-mono font-bold text-white">{createSuccessProduct.sku}</span> has been stored and is now live in the store catalog.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between pb-2 border-b border-slate-800 text-slate-400">
                      <span>Category</span>
                      <span className="font-medium text-slate-200">{createSuccessProduct.category}</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-slate-800 text-slate-400">
                      <span>Unit Price</span>
                      <span className="font-mono font-medium text-emerald-400">
                        ${createSuccessProduct.price.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-slate-800 text-slate-400">
                      <span>Initial Stock</span>
                      <span className="font-mono font-medium text-slate-200">
                        {createSuccessProduct.stock} units
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Unit Weight</span>
                      <span className="font-mono text-slate-300">
                        {createSuccessProduct.weight_kg.toFixed(3)} kg
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleContinueCreate}
                      className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {createFormError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{createFormError}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          SKU <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. KNT-CPU-9900X"
                          value={createForm.sku}
                          onChange={(e) => setCreateForm({ ...createForm, sku: e.target.value.toUpperCase() })}
                          className="block w-full px-3 py-2 text-xs text-white uppercase font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Category <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Computing"
                          value={createForm.category}
                          onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Product Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ultra Fast NVMe SSD 2TB"
                        value={createForm.name}
                        onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                        className="block w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Price ($) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          placeholder="99.99"
                          value={createForm.price}
                          onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Stock <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          required
                          placeholder="10"
                          value={createForm.stock}
                          onChange={(e) => setCreateForm({ ...createForm, stock: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Weight (kg) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          required
                          placeholder="0.500"
                          value={createForm.weight_kg}
                          onChange={(e) => setCreateForm({ ...createForm, weight_kg: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Technical specifications, interface details, and capabilities..."
                        value={createForm.description}
                        onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                        className="block w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCreateModalOpen(false);
                          setCreateFormError(null);
                        }}
                        className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingCreate}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                      >
                        {isSubmittingCreate && (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        )}
                        <span>{isSubmittingCreate ? 'Creating...' : 'Create Product'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editModalProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={editSuccessProduct ? handleContinueEdit : () => setEditModalProduct(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div
              className="relative transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left shadow-2xl transition-all w-full max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-blue-400">
                    Inventory Catalog
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">
                    {editSuccessProduct ? 'Product Updated Successfully' : 'Edit Product Details'}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    SKU: {editModalProduct.sku}
                  </p>
                </div>
                <button
                  onClick={editSuccessProduct ? handleContinueEdit : () => setEditModalProduct(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close edit modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {editSuccessProduct ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-200 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-emerald-300">
                        Product details updated successfully!
                      </p>
                      <p className="text-emerald-300/80">
                        Changes to <strong className="text-white">{editSuccessProduct.name}</strong> have been saved to the catalog.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between pb-2 border-b border-slate-800 text-slate-400">
                      <span>Category</span>
                      <span className="font-medium text-slate-200">{editSuccessProduct.category}</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-slate-800 text-slate-400">
                      <span>Price</span>
                      <span className="font-mono font-medium text-emerald-400">
                        ${editSuccessProduct.price.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-slate-800 text-slate-400">
                      <span>Stock</span>
                      <span className="font-mono font-medium text-slate-200">
                        {editSuccessProduct.stock} units
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Weight</span>
                      <span className="font-mono text-slate-300">
                        {editSuccessProduct.weight_kg.toFixed(3)} kg
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleContinueEdit}
                      className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {editFormError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 mb-4 text-xs text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{editFormError}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveEdit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Product Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="block w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Category
                        </label>
                        <input
                          type="text"
                          required
                          value={editForm.category}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Price ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={editForm.price}
                          onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Stock Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={editForm.stock}
                          onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Weight (kg)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          required
                          value={editForm.weight_kg}
                          onChange={(e) => setEditForm({ ...editForm, weight_kg: e.target.value })}
                          className="block w-full px-3 py-2 text-xs text-white font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="block w-full px-3 py-2 text-xs text-white bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditModalProduct(null)}
                        className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteModalProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={deleteSuccessProduct ? handleContinueDelete : () => setDeleteModalProduct(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div
              className="relative transform overflow-hidden rounded-2xl border border-rose-900/50 bg-slate-900 p-6 text-left shadow-2xl transition-all w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  deleteSuccessProduct
                    ? 'bg-emerald-950/80 border border-emerald-800/60 text-emerald-400'
                    : 'bg-rose-950/80 border border-rose-800/60 text-rose-400'
                }`}>
                  {deleteSuccessProduct ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {deleteSuccessProduct ? 'Product Deleted Successfully' : 'Delete Product'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {deleteSuccessProduct ? 'Catalog Updated' : 'Confirmation Required'}
                  </p>
                </div>
              </div>

              {deleteSuccessProduct ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs text-emerald-200">
                    <p className="font-semibold text-emerald-300">
                      Product &quot;{deleteSuccessProduct.name}&quot; deleted successfully!
                    </p>
                    <p className="text-emerald-300/80 mt-1">
                      SKU <span className="font-mono font-bold text-white">{deleteSuccessProduct.sku}</span> has been removed from catalog inventory and stock tracking.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleContinueDelete}
                      className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-5 rounded-lg bg-slate-950 p-3.5 border border-slate-800 text-xs text-slate-300">
                    <p>
                      Are you sure you want to permanently delete{' '}
                      <strong className="text-white">{deleteModalProduct.name}</strong>?
                    </p>
                    <p className="text-slate-500 font-mono mt-1">SKU: {deleteModalProduct.sku}</p>
                    <p className="text-rose-400/90 mt-2">
                      This action cannot be undone and removes all stock tracking immediately.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setDeleteModalProduct(null)}
                      className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleConfirmDelete}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-lg transition-colors shadow-sm shadow-rose-600/20"
                    >
                      {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isDeleting ? 'Deleting...' : 'Confirm Deletion'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {purchaseModalProduct && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setPurchaseModalProduct(null)}
          />

          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div
              className="relative transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left shadow-2xl transition-all w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-blue-400">
                    Checkout Authorization
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">{purchaseModalProduct.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    SKU: {purchaseModalProduct.sku}
                  </p>
                </div>
                <button
                  onClick={() => setPurchaseModalProduct(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close purchase modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {purchaseStatus && (
                <div
                  className={`rounded-xl border p-4 mb-4 text-xs ${
                    purchaseStatus.success
                      ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
                      : 'border-rose-500/30 bg-rose-950/40 text-rose-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    {purchaseStatus.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{purchaseStatus.success ? 'Transaction Authorized' : 'Transaction Blocked'}</span>
                  </div>
                  <p>{purchaseStatus.message}</p>
                </div>
              )}

              {purchaseStatus?.success ? (
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setPurchaseModalProduct(null)}
                    className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                  >
                    Continue
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Purchase Quantity (Available:{' '}
                      <span className="font-mono text-emerald-400">{purchaseModalProduct.stock}</span>)
                    </label>
                    <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => setPurchaseQty((q) => Math.max(1, q - 1))}
                        disabled={purchaseQty <= 1}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        value={purchaseQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setPurchaseQty(Math.min(purchaseModalProduct.stock, Math.max(1, val)));
                        }}
                        className="w-full text-center bg-transparent border-0 text-white font-mono text-sm focus:ring-0 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setPurchaseQty((q) => Math.min(purchaseModalProduct.stock, q + 1))
                        }
                        disabled={purchaseQty >= purchaseModalProduct.stock}
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-3.5 space-y-2">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Unit Price</span>
                      <span className="font-mono text-slate-300">
                        ${purchaseModalProduct.price.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Concurrency Lock</span>
                      <span className="font-mono text-blue-400">SELECT FOR UPDATE</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-semibold text-white">
                      <span>Total Cost</span>
                      <span className="font-mono text-emerald-400">
                        ${(purchaseModalProduct.price * purchaseQty).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setPurchaseModalProduct(null)}
                      className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleExecutePurchase}
                      disabled={isPurchasing || purchaseModalProduct.stock <= 0}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                    >
                      {isPurchasing ? 'Locking & Deducting...' : 'Confirm Transaction'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {csvModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => {
              setCsvModalOpen(false);
              setCsvSummary(null);
              setSelectedCsvFile(null);
              setSelectedCsvContent(null);
            }}
          />

          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div
              className="relative transform overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 text-left shadow-2xl transition-all w-full max-w-lg mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-blue-400">
                    Inventory Management
                  </span>
                  <h3 className="text-lg font-bold text-white mt-0.5">
                    {csvSummary ? 'CSV Import Summary' : 'Import Products via CSV'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {csvSummary
                      ? 'Review batch ingestion diagnostics and catalog updates.'
                      : 'Upload a CSV file matching the schema to expand catalog inventory.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCsvModalOpen(false);
                    setCsvSummary(null);
                    setSelectedCsvFile(null);
                    setSelectedCsvContent(null);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close CSV modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {csvSummary ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                      <span className="font-medium text-slate-300">Import Batch Summary</span>
                      <span className="font-mono text-slate-400">
                        {csvSummary.total_rows} rows processed
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-emerald-950/30 border border-emerald-800/40 p-2.5">
                        <span className="text-emerald-400 block font-medium">Added to Store</span>
                        <span className="text-lg font-bold font-mono text-emerald-300">
                          {csvSummary.successful_imports}
                        </span>
                      </div>
                      <div className="rounded-lg bg-rose-950/30 border border-rose-800/40 p-2.5">
                        <span className="text-rose-400 block font-medium">Validation Errors</span>
                        <span className="text-lg font-bold font-mono text-rose-300">
                          {csvSummary.failed_imports}
                        </span>
                      </div>
                    </div>

                    {csvSummary.errors.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs font-semibold text-rose-400 block mb-1.5">
                          Security & Validation Diagnostics:
                        </span>
                        <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-lg bg-slate-900 p-2.5 text-xs border border-slate-800">
                          {csvSummary.errors.map((err, idx) => (
                            <div key={idx} className="text-rose-300/90 leading-tight">
                              <span className="font-mono text-slate-400">Row {err.row_number}:</span>{' '}
                              {err.sku && (
                                <span className="font-mono text-slate-300">[{err.sku}] </span>
                              )}
                              <span>{err.error}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCsvModalOpen(false);
                        setCsvSummary(null);
                        setSelectedCsvFile(null);
                        setSelectedCsvContent(null);
                        setCurrentPage(1);
                      }}
                      className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-4 rounded-lg bg-slate-950 p-3 border border-slate-800 text-xs text-slate-400 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-300">Required CSV Columns:</p>
                      <span className="text-[11px] text-emerald-400 font-medium">
                        Injection Protection Active
                      </span>
                    </div>
                    <p className="font-mono text-slate-400">
                      sku, name, description, category, price, stock, weight_kg
                    </p>
                    <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800/80 mt-2">
                      <button
                        type="button"
                        onClick={handleDownloadSampleCsv}
                        className="text-blue-400 hover:text-blue-300 underline font-medium text-xs"
                      >
                        Download Sample CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleTestInjectionBatch}
                        className="text-amber-400 hover:text-amber-300 font-medium text-xs underline"
                      >
                        Test Malicious CSV Payload
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-2">
                        Select CSV File
                      </label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedCsvFile(file);
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const content = event.target?.result as string;
                              if (content) {
                                setSelectedCsvContent(content);
                              }
                            };
                            reader.readAsText(file);
                          }
                        }}
                        className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                      />
                      {selectedCsvFile && (
                        <p className="text-xs text-emerald-400 mt-1 font-mono">
                          Staged: {selectedCsvFile.name} ({(selectedCsvFile.size / 1024).toFixed(1)} KB)
                        </p>
                      )}
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCsvModalOpen(false);
                          setSelectedCsvFile(null);
                          setSelectedCsvContent(null);
                        }}
                        className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!selectedCsvContent}
                        onClick={() => {
                          if (selectedCsvContent) {
                            handleCsvUpload(selectedCsvContent);
                          }
                        }}
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm shadow-blue-500/20"
                      >
                        Process CSV Batch
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
