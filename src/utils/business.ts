import type {
  Booking,
  BookingRule,
  BookingStatus,
  Exhibition,
  ExhibitionSession,
  Member,
  SessionStatus,
} from "../types/domain";

export const activeBookingStatuses: BookingStatus[] = ["pending_use", "checked_in"];

export function remainingStock(session: ExhibitionSession) {
  return Math.max(session.totalStock - session.bookedCount, 0);
}

export function displaySessionStatus(session: ExhibitionSession): SessionStatus {
  if (session.status === "closed" || session.status === "ended" || session.status === "pending") {
    return session.status;
  }
  if (remainingStock(session) <= 0) {
    return "full";
  }
  return "open";
}

export function statusText(status: SessionStatus) {
  const map: Record<SessionStatus, string> = {
    pending: "未开放",
    open: "可预约",
    full: "已约满",
    ended: "已结束",
    closed: "已关闭",
  };
  return map[status];
}

export function bookingStatusText(status: BookingStatus) {
  const map: Record<BookingStatus, string> = {
    pending_use: "待使用",
    cancelled: "已取消",
    checked_in: "已核销",
    expired: "已过期",
  };
  return map[status];
}

export function canSelectSession(session: ExhibitionSession) {
  return displaySessionStatus(session) === "open" && remainingStock(session) > 0;
}

export function hasActiveBookingForExhibition(
  bookings: Booking[],
  exhibitionId: string,
  memberId: string,
) {
  return bookings.some(
    (booking) =>
      booking.exhibitionId === exhibitionId &&
      booking.memberId === memberId &&
      activeBookingStatuses.includes(booking.status),
  );
}

type ValidationInput = {
  member: Member;
  exhibition: Exhibition;
  rule: BookingRule;
  session: ExhibitionSession;
  bookings: Booking[];
  noticeAccepted: boolean;
};

export function validateBooking(input: ValidationInput): string | null {
  const { member, exhibition, rule, session, bookings, noticeAccepted } = input;

  if (rule.loginRequired && !member.isLoggedIn) return "请先登录会员账号后再预约";
  if (exhibition.status !== "published") return "当前活动未上架，暂不可预约";
  if (rule.selfOnly && (!member.memberId || !member.name || !member.phone)) {
    return "预约人信息必须来自当前登录会员";
  }
  if (rule.fixedBookingCount !== 1) return "当前 Demo 仅支持本人单人预约";
  if (rule.oneSessionPerMember && hasActiveBookingForExhibition(bookings, exhibition.exhibitionId, member.memberId)) {
    return "当前活动限制每位会员只能预约一个场次";
  }
  if (!canSelectSession(session)) return `该场次${statusText(displaySessionStatus(session))}，不可预约`;
  if (!noticeAccepted) return "请先勾选并确认预约须知";
  return null;
}

export function createBookingCode() {
  return `EX${new Date().getTime().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
}

export function formatRange(start: string, end: string) {
  return `${start} - ${end.slice(11)}`;
}

export function nowText() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
