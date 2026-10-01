import {
  ArrowLeft,
  Bell,
  Calendar,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  CreditCard,
  EllipsisVertical,
  Feather,
  FileText,
  Folder,
  Hexagon,
  House,
  type IconNode,
  Inbox,
  Info,
  Languages,
  LogOut,
  Minus,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  Trash,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from 'lucide';

interface IconDefinition {
  readonly node: IconNode;
  /** Points along the reading direction (arrows, chevrons): mirrored in RTL (docs/ARCHITECTURE.md §17, §26). */
  readonly directional: boolean;
}

const icon = (node: IconNode, directional = false): IconDefinition => ({ node, directional });

/**
 * The Nawara icon set: Lucide (ISC), brand board "Icon style (Lucide based)". Only registered icons are bundled;
 * add an entry here to use a new one. Names are Lucide's kebab-case names.
 */
export const NW_ICONS = {
  'arrow-left': icon(ArrowLeft, true),
  bell: icon(Bell),
  calendar: icon(Calendar),
  'chart-column': icon(ChartColumn),
  check: icon(Check),
  'chevron-down': icon(ChevronDown),
  'chevron-right': icon(ChevronRight, true),
  'circle-alert': icon(CircleAlert),
  'circle-check': icon(CircleCheck),
  'circle-x': icon(CircleX),
  copy: icon(Copy),
  'credit-card': icon(CreditCard),
  'ellipsis-vertical': icon(EllipsisVertical),
  feather: icon(Feather),
  'file-text': icon(FileText),
  folder: icon(Folder),
  hexagon: icon(Hexagon),
  house: icon(House),
  inbox: icon(Inbox),
  info: icon(Info),
  languages: icon(Languages),
  'log-out': icon(LogOut, true),
  minus: icon(Minus),
  monitor: icon(Monitor),
  moon: icon(Moon),
  pencil: icon(Pencil),
  plus: icon(Plus),
  'refresh-cw': icon(RefreshCw),
  search: icon(Search),
  settings: icon(Settings),
  'shield-check': icon(ShieldCheck),
  sparkles: icon(Sparkles),
  store: icon(Store),
  sun: icon(Sun),
  trash: icon(Trash),
  'triangle-alert': icon(TriangleAlert),
  'user-round': icon(UserRound),
  users: icon(Users),
  x: icon(X),
} as const satisfies Record<string, IconDefinition>;

export type NwIconName = keyof typeof NW_ICONS;
