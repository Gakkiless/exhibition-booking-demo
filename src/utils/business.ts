import type {
  Booking,
  BookingRule,
  BookingStatus,
  Exhibition,
  ExhibitionSession,
  Member,
  SessionStatus,
} from "../types/domain";

export const activeBookingStatuses: BookingStatus[] = ["pending_checkin", "checked_in"];
export const demoNowText = "2026-06-05 12:00";

export function activityDisplayStatus(exhibition: Exhibition, now = demoNowText) {
  if (exhibition.status !== "published") return "未上架";
  if (now < exhibition.exhibitionStartTime) return "未开始";
  if (now > exhibition.exhibitionEndTime) return "已结束";
  return "进行中";
}

export function bookingTimeStatus(exhibition: Exhibition, now = demoNowText) {
  if (now < exhibition.bookingStartTime) return "pending";
  if (now > exhibition.bookingEndTime) return "ended";
  return "open";
}

export function remainingStock(session: ExhibitionSession) {
  return Math.max(session.totalStock - session.bookedCount, 0);
}

export function internalBookedCount(bookings: Booking[], sessionId: string) {
  return bookings.filter(
    (booking) =>
      booking.sessionId === sessionId &&
      booking.source === "销售代客报名" &&
      activeBookingStatuses.includes(booking.status),
  ).length;
}

export function publicBookedCount(session: ExhibitionSession, bookings: Booking[]) {
  void bookings;
  return Math.max(session.bookedCount, 0);
}

export function publicRemainingStock(session: ExhibitionSession, bookings: Booking[]) {
  return Math.max(session.totalStock - publicBookedCount(session, bookings), 0);
}

export function displaySessionStatus(session: ExhibitionSession, bookings?: Booking[], channel: "client" | "sales" | "total" = "total"): SessionStatus {
  if (session.status === "ended" || session.status === "pending") {
    return session.status;
  }
  if (channel === "sales") {
    return "open";
  }
  const remain =
    channel === "client" && bookings
      ? publicRemainingStock(session, bookings)
      : remainingStock(session);
  if (remain <= 0) {
    return "full";
  }
  return "open";
}

export function statusText(status: SessionStatus) {
  const map: Record<SessionStatus, string> = {
    pending: "未开放",
    open: "可报名",
    full: "已约满",
    ended: "已结束",
  };
  return map[status];
}

export function bookingStatusText(status: BookingStatus) {
  const map: Record<BookingStatus, string> = {
    pending_checkin: "待签到",
    cancelled: "已取消",
    checked_in: "已签到",
    expired: "已过期",
  };
  return map[status];
}

export function canSelectSession(session: ExhibitionSession, bookings?: Booking[], channel: "client" | "sales" | "total" = "total") {
  return displaySessionStatus(session, bookings, channel) === "open";
}

export function canClientBookSession(session: ExhibitionSession, bookings: Booking[]) {
  return canSelectSession(session, bookings, "client") && publicRemainingStock(session, bookings) > 0;
}

export function canSalesBookSession(session: ExhibitionSession, bookings: Booking[]) {
  void bookings;
  return session.status === "open";
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
  channel?: "client" | "sales";
};

export function validateBooking(input: ValidationInput): string | null {
  const { member, exhibition, rule, session, bookings, noticeAccepted, channel = "client" } = input;

  if (rule.loginRequired && !member.isLoggedIn) return "请先登录会员账号后再报名";
  if (exhibition.status !== "published") return "当前活动未上架，暂不可报名";
  if (channel === "client") {
    const timeStatus = bookingTimeStatus(exhibition);
    if (timeStatus === "pending") return "报名暂未开始";
    if (timeStatus === "ended") return "报名已结束";
  }
  if (rule.selfOnly && (!member.memberId || !member.name || !member.phone)) {
    return "报名人信息必须来自当前登录会员";
  }
  if (rule.fixedBookingCount !== 1) return "当前 Demo 仅支持本人单人报名";
  if (rule.oneSessionPerMember && hasActiveBookingForExhibition(bookings, exhibition.exhibitionId, member.memberId)) {
    return "当前活动限制每位会员只能报名一个场次";
  }
  if (channel === "sales") {
    if (!canSalesBookSession(session, bookings)) return `该场次${statusText(displaySessionStatus(session))}，销售不可继续代报名`;
  } else if (!canClientBookSession(session, bookings)) {
    return `该场次${statusText(displaySessionStatus(session, bookings, "client"))}，不可报名`;
  }
  if (!noticeAccepted) return "请先勾选并确认报名须知";
  return null;
}

export function createBookingCode() {
  return `EX${new Date().getTime().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
}

export function formatRange(start: string, end: string) {
  if (start.slice(0, 10) !== end.slice(0, 10)) {
    return `${start} - ${end}`;
  }
  return `${start} - ${end.slice(11)}`;
}

export function nowText() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
