export type Member = {
  memberId: string;
  name: string;
  realName?: string;
  isRealNameVerified?: boolean;
  phone: string;
  level: string;
  isLoggedIn: boolean;
};

export type Exhibition = {
  exhibitionId: string;
  title: string;
  coverImage: string;
  sharePosterImage: string;
  sharePosterTitle: string;
  sharePosterDesc: string;
  description: string;
  detailedDescription: string;
  successSmsTemplate: string;
  location: string;
  exhibitionStartTime: string;
  exhibitionEndTime: string;
  bookingStartTime: string;
  bookingEndTime: string;
  notice: string;
  bookingFields: BookingField[];
  visibleInMiniProgram: boolean;
  shareEnabled: boolean;
  status: "draft" | "published" | "closed";
};

export type BookingField = {
  fieldId: string;
  label: string;
  required: boolean;
};

export type BookingRule = {
  exhibitionId: string;
  loginRequired: boolean;
  selfOnly: boolean;
  fixedBookingCount: 1;
  oneSessionPerMember: boolean;
  allowCancel: boolean;
  cancelDeadlineHours: number;
};

export type SessionStatus = "pending" | "open" | "full" | "ended" | "closed";

export type ExhibitionSession = {
  sessionId: string;
  exhibitionId: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  totalStock: number;
  bookedCount: number;
  bookingCloseHours: number;
  status: SessionStatus;
};

export type BookingStatus = "pending_checkin" | "cancelled" | "checked_in" | "expired";

export type Booking = {
  bookingId: string;
  bookingCode: string;
  exhibitionId: string;
  sessionId: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  memberLevel: string;
  bookingCount: 1;
  status: BookingStatus;
  source: "小程序" | "后台" | "销售代客报名";
  createdAt: string;
  formValues?: Record<string, string>;
  salesUserId?: string;
  salesUserName?: string;
  salesRole?: string;
  assistedAt?: string;
  signedInAt?: string;
  signInSource?: "现场二维码";
  checkedInAt?: string;
  cancelledAt?: string;
};

export type OperationLog = {
  logId: string;
  objectType: "活动" | "场次";
  objectId: string;
  objectName: string;
  action: string;
  operatorRole: string;
  operatorName: string;
  createdAt: string;
  detail: string;
};

export type AppState = {
  member: Member;
  members: Member[];
  exhibitions: Exhibition[];
  rules: BookingRule[];
  sessions: ExhibitionSession[];
  bookings: Booking[];
  operationLogs: OperationLog[];
};

export type ToastType = "success" | "error" | "info";
