/*
 * HAMPO 3290 / USB-3372 + GENTOS RHB02BK head-mounted recorder
 *
 * Coordinate system for each printable part:
 *   X: wearer's left/right
 *   Y: up/down
 *   Z: away from the head
 *
 * All dimensions are millimetres.  The default `3290` profile follows HAMPO's
 * public drawing 2.03.3290.011.  The alternate `3372_fit` profile is only a
 * photo-derived measuring envelope because HAMPO has not published the
 * USB-3372-V1.0 mechanical drawing.  Never apply 3290 dimensions to 3372.
 */

part = "front_preview";
// [front_preview,front_exploded,rear_preview,rear_exploded,front_case,front_cover,board_carrier,board_gauge,front_yoke,rear_cradle,rear_retainer,pivot_washer,band_coupon,band_pull_coupon,insert_coupon,insert_coupon_horizontal,rear_screw_coupon,cable_clip]

module_profile = "3290";
// [3290,3372_fit]
profile_is_3290 = module_profile == "3290";
mechanical_data_confirmed = profile_is_3290;

$fn = 48;
eps = 0.05;

// ---------------------------------------------------------------------------
// RHB02BK interface
// Published reseller reference: about 19 mm wide. Thickness is unpublished.
// These PETG-oriented defaults are intentionally generous and are checked with
// band_coupon before the full parts are printed.
// ---------------------------------------------------------------------------
strap_nominal_width = 19.0;
strap_slot_height = 21.5;
strap_slot_depth = 4.5;
strap_slot_radius = 1.9;
strap_bar_width = 5.5;

// ---------------------------------------------------------------------------
// Camera module profile
// ---------------------------------------------------------------------------
// 3290 values from HAMPO drawing 2.03.3290.011:
//   PCB 100 x 17 x 1.6, complete height 16.8, lens baseline 60,
//   lens OD 14, optical length 15.15 +/- 0.3, H/V FOV 115/80 deg,
//   outer mounting-hole centres 94 x 13.  The raster drawing reads 4 x dia 2,
//   but no vector/PDF drawing is public, so the delivered PCB still decides
//   the production fit.  Keep that board-hole value separate from the FDM
//   clearance used for the M1.6 screw path in the carrier.
// 3372_fit remains an intentionally conservative photo envelope.
board_width = profile_is_3290 ? 100.0 : 108.0;
board_height = profile_is_3290 ? 17.0 : 28.0;
board_thickness = 1.6;
board_total_depth = profile_is_3290 ? 16.8 : 24.0;
board_mount_column_x = profile_is_3290 ? 47.0 : 43.0;
board_mount_row_y = profile_is_3290 ? 6.5 : 10.0;
board_mount_hole_diameter = profile_is_3290 ? 2.0 : 2.4;
board_fastener_clearance = profile_is_3290 ? 1.9 : 2.4;
board_fastener_head_diameter = profile_is_3290 ? 3.4 : 4.3;
board_fastener_head_recess = profile_is_3290 ? 1.7 : 1.0;
board_fastener_length = profile_is_3290 ? 8.0 : 8.0;
board_washer_thickness = profile_is_3290 ? 0.3 : 0.5;
board_nut_height = profile_is_3290 ? 1.3 : 1.6;
lens_baseline = profile_is_3290 ? 60.0 : 76.0;
lens_barrel_diameter = profile_is_3290 ? 14.0 : 16.0;
lens_height_from_pcb = profile_is_3290 ? 15.15 : 20.5;
lens_horizontal_fov = profile_is_3290 ? 115.0 : 115.0;
lens_vertical_fov = profile_is_3290 ? 80.0 : 80.0;
lens_window_y = 0.0;
lens_radial_clearance = 1.2;
lens_proud = 0.6;

// ---------------------------------------------------------------------------
// Front enclosure
// ---------------------------------------------------------------------------
front_wall = 1.9;
front_radius = 5.0;
front_cavity_width = board_width + 3.5;
front_cavity_height = board_height + 12.0;
front_width = front_cavity_width + 6.5;
front_height = front_cavity_height + 7.0;
front_cover_thickness = 2.2;
front_cover_lip_depth = 1.4;

// A rigid, separately printable carrier prevents cover-screw torque from
// bending the calibrated stereo PCB. Its bottom sits on the cover's inner face.
carrier_base_thickness = 2.0;
board_standoff_height = profile_is_3290 ? 3.8 : 4.2;
board_plane_z = carrier_base_thickness + board_standoff_height;
carrier_mount_x = board_width / 2 - 12.0;
carrier_mount_y = board_height / 2 + 0.5;
carrier_mount_boss_diameter = 6.4;
// Wilco HSB-203030: D1=3.0, L=3.0; maker bore B=D1+0.05 and
// receiving depth C>=L+0.5. Separate vertical/horizontal values let the fit
// coupons compensate for FDM orientation without moving the hardware.
m2_insert_pilot_vertical = 3.05;
m2_insert_pilot_horizontal = 3.05;
carrier_mount_insert_diameter = m2_insert_pilot_vertical;
carrier_mount_insert_depth = 3.5;
carrier_screw_clearance = 2.4;
front_depth = board_plane_z + board_total_depth - lens_proud;

lens_window_inner_width = lens_barrel_diameter +
                          2 * lens_radial_clearance;
lens_window_inner_height = lens_window_inner_width;
lens_window_outer_width = lens_window_inner_width +
                          2 * front_wall *
                          tan((lens_horizontal_fov + 4.0) / 2);
lens_window_outer_height = lens_window_inner_height +
                           2 * front_wall *
                           tan((lens_vertical_fov + 4.0) / 2);

cover_screw_x = front_width / 2 - 5.0;
cover_screw_y = front_height / 2 - 5.0;
cover_screw_clearance = 2.4;
cover_insert_diameter = m2_insert_pilot_vertical;
cover_insert_depth = 3.5;

button_window_x = 0.0;
button_window_width = 36.0;
button_window_depth = 15.0;
usb_window_x = 32.0;
usb_window_width = 50.0;
usb_window_depth = 15.0;
connector_exit_width = 18.0;
connector_exit_depth = 11.0;

// Headlamp-style angle adjustment. M3 x 8 low-head screws, M3 heat-set
// inserts in the case bosses, and thin TPU friction washers.
pivot_y = -front_height / 2 + 8.5;
pivot_z = 7.0;
pivot_boss_radius = 7.0;
pivot_boss_thickness = 6.2;
pivot_boss_overlap = 2.0;
pivot_screw_clearance = 3.35;
// Wilco HSB-304540: D1=4.5, L=4.0; maker bore B=4.55 and C>=4.5.
pivot_insert_diameter = 4.55;
pivot_insert_depth = 4.5;
pivot_head_diameter = 6.3;
pivot_head_recess = 1.1;
pivot_side_clearance = 0.7;
pivot_washer_inner_diameter = 3.6;
pivot_washer_outer_diameter = 10.0;
pivot_washer_thickness = 0.6;
front_case_head_gap = 8.0;
camera_down_angle = 17.0;
camera_angle_min = 0.0;
camera_angle_max = 25.0;
stop_radius = 7.0;
stop_screw_shank_diameter = 2.0;
stop_slot_diameter = 3.0;
stop_head_track_diameter = 5.2;
stop_head_track_depth = 0.9;
stop_insert_diameter = m2_insert_pilot_horizontal;
stop_insert_depth = 3.5;
stop_arc_segments = 12;
stop_clearance_angle = asin((stop_slot_diameter -
                             stop_screw_shank_diameter) /
                            (2 * stop_radius));

// ---------------------------------------------------------------------------
// Rear battery cage: Anker A1653 official nominal 77 x 37 x 25 mm.
// ---------------------------------------------------------------------------
battery_width = 77.0;
battery_height = 37.0;
battery_depth = 25.0;
battery_clearance_xy = 2.0;
battery_clearance_z = 2.0;
rear_wall = 2.4;
rear_backplate_thickness = 2.8;
rear_air_gap = 3.0;
rear_retainer_thickness = 3.0;
rear_port_open_height = 18.0;
rear_port_open_depth = 20.0;
rear_port_center_y = 7.0;
rear_port_z_from_battery_back = 3.0;
rear_button_center_y = 7.0;
rear_screw_pilot = 1.70;
rear_button_z_from_battery_back = 4.0;
rear_top_hinge_keepout = 30.0;

// ---------------------------------------------------------------------------
// Cable clip
// ---------------------------------------------------------------------------
cable_diameter = 4.2;

function clamp(v, lo, hi) = min(max(v, lo), hi);

assert(module_profile == "3290" || module_profile == "3372_fit",
       "module_profile must be 3290 or 3372_fit");
assert(front_cavity_width - board_width >= 2.0,
       "camera board needs at least 1 mm side clearance");
assert(front_cavity_height - board_height >= 2.0,
       "camera board needs at least 1 mm top/bottom clearance");
assert(board_mount_column_x + 3.0 <= front_cavity_width / 2,
       "board mounting support falls outside front cavity");
assert(carrier_mount_y + carrier_mount_boss_diameter / 2 <=
       (front_cavity_height - 0.9 - 2.4) / 2,
       "carrier mount collides with cover locating lip");
assert(!profile_is_3290 ||
       board_fastener_length -
       ((board_plane_z - board_fastener_head_recess) +
        board_thickness + board_washer_thickness + board_nut_height) >= 0.65,
       "board screw needs at least 0.65 mm beyond the complete stack");
assert(pivot_washer_thickness < pivot_side_clearance,
       "pivot washer must leave running clearance");

module rounded_rect_2d(w, h, r) {
    rr = clamp(r, 0.01, min(w, h) / 2 - 0.01);
    offset(r = rr)
        square([w - 2 * rr, h - 2 * rr], center = true);
}

module rounded_box(w, h, d, r) {
    linear_extrude(height = d)
        rounded_rect_2d(w, h, r);
}

module rounded_slot(w, h, d, r) {
    linear_extrude(height = d)
        rounded_rect_2d(w, h, r);
}

// Inner opening clears the lens barrel; the outer opening grows by the
// published FOV plus 2 degrees per side. This keeps the 1.9 mm front wall out
// of the nominal ray bundle when the lens nose protrudes by lens_proud.
module tapered_rounded_slot(inner_w, inner_h, outer_w, outer_h, depth) {
    hull() {
        linear_extrude(height = eps)
            rounded_rect_2d(inner_w, inner_h,
                            min(1.5, inner_w / 8, inner_h / 8));
        translate([0, 0, depth - eps])
            linear_extrude(height = eps)
                rounded_rect_2d(outer_w, outer_h,
                                min(1.5, outer_w / 8, outer_h / 8));
    }
}

// Arc channel in a yoke arm. A removable M2 stop screw reaches each rounded
// end at exactly camera_angle_min/max after its radial running clearance is
// taken into account.
module stop_arc_channel(center_x, diameter, depth, pivot_global_z) {
    a0 = camera_angle_min + stop_clearance_angle;
    a1 = camera_angle_max - stop_clearance_angle;
    for (i = [0 : stop_arc_segments - 1]) {
        ai = a0 + (a1 - a0) * i / stop_arc_segments;
        aj = a0 + (a1 - a0) * (i + 1) / stop_arc_segments;
        hull() {
            translate([center_x,
                       pivot_y + stop_radius * cos(ai),
                       pivot_global_z + stop_radius * sin(ai)])
                rotate([0, 90, 0])
                    cylinder(d = diameter, h = depth, center = true);
            translate([center_x,
                       pivot_y + stop_radius * cos(aj),
                       pivot_global_z + stop_radius * sin(aj)])
                rotate([0, 90, 0])
                    cylinder(d = diameter, h = depth, center = true);
        }
    }
}

module countersunk_hole(d, head_d, depth) {
    translate([0, 0, -eps])
        cylinder(d1 = head_d, d2 = d, h = min(1.2, depth / 2) + eps);
    translate([0, 0, min(1.2, depth / 2) - eps])
        cylinder(d = d, h = depth + 2 * eps);
}

module counterbored_hole(d, head_d, head_depth, depth) {
    translate([0, 0, -eps])
        cylinder(d = head_d, h = head_depth + eps);
    translate([0, 0, head_depth - eps])
        cylinder(d = d, h = depth - head_depth + 2 * eps);
}

module vertical_band_ear(center_x, plate_depth, ear_height = 30.0) {
    ear_width = strap_slot_depth + 2 * strap_bar_width;
    difference() {
        translate([center_x, 0, 0])
            rounded_box(ear_width, ear_height, plate_depth, 3.0);
        translate([center_x, 0, -eps])
            rounded_slot(strap_slot_depth, strap_slot_height,
                         plate_depth + 2 * eps, strap_slot_radius);
    }
}

// ---------------------------------------------------------------------------
// Front case body
// ---------------------------------------------------------------------------
module front_case() {
    boss_r = 3.3;
    boss_depth = 7.0;
    pivot_x = front_width / 2 + pivot_boss_thickness / 2 -
              pivot_boss_overlap;
    pivot_outer_x = front_width / 2 + pivot_boss_thickness -
                    pivot_boss_overlap;

    difference() {
        union() {
            // Open-backed shell. The thin wall at +Z is the lens-side face.
            difference() {
                rounded_box(front_width, front_height, front_depth, front_radius);
                translate([0, 0, -eps])
                    rounded_box(front_cavity_width, front_cavity_height,
                                front_depth - front_wall + eps,
                                max(2.0, front_radius - front_wall));
            }

            // Four cover screw bosses.
            for (x = [-cover_screw_x, cover_screw_x])
                for (y = [-cover_screw_y, cover_screw_y])
                    translate([x, y, 0])
                        cylinder(r = boss_r, h = boss_depth);

            // External friction-pivot bosses.
            for (sx = [-1, 1])
                translate([sx * pivot_x, pivot_y, pivot_z])
                    rotate([0, 90, 0])
                        cylinder(r = pivot_boss_radius,
                                 h = pivot_boss_thickness, center = true);

            // Secondary bosses accept removable M2 stop screws.  The screws
            // ride in yoke slots and create physical stops at 0 and 25 degrees.
            // They are installed after the case is placed between the arms,
            // so the reinforced PETG arms never need to be snap-flexed apart.
            for (sx = [-1, 1])
                translate([sx * pivot_x,
                           pivot_y + stop_radius, pivot_z])
                    rotate([0, 90, 0])
                        cylinder(r = 3.3,
                                 h = pivot_boss_thickness, center = true);
        }

        // Outward-tapered lens windows. On the 3290 profile their growth is
        // calculated from the published H/V FOV and the 1.9 mm wall depth.
        for (x = [-lens_baseline / 2, lens_baseline / 2])
            translate([x, lens_window_y, front_depth - front_wall - eps])
                tapered_rounded_slot(lens_window_inner_width,
                                     lens_window_inner_height,
                                     lens_window_outer_width,
                                     lens_window_outer_height,
                                     front_wall + 2 * eps);

        if (profile_is_3290) {
            // Drawing/photo-visible harness headers. Cables are connected
            // before closing the case and leave through these generous lower
            // slots. Tie the harness to the moving carrier before the slot;
            // the external service loop terminates on the fixed yoke.
            for (x = [-40.0, 13.0])
                translate([x - connector_exit_width / 2,
                           -front_height / 2 - eps, 1.0])
                    cube([connector_exit_width, front_wall + 1.2,
                          connector_exit_depth]);

            // Three short top vents sit away from both lens barrels.
            for (x = [-18.0, 0.0, 18.0])
                translate([x - 3.0,
                           front_height / 2 - front_wall - 0.5, 3.0])
                    cube([6.0, front_wall + 1.0, 7.0]);
        } else {
            // USB-3372 photo-fit openings: central microSD/button access,
            // broad right-side USB service bay, ventilation and antenna coax.
            translate([button_window_x - button_window_width / 2,
                       front_height / 2 - front_wall - 0.8, 1.0])
                cube([button_window_width, front_wall + 1.8,
                      button_window_depth]);

            translate([usb_window_x - usb_window_width / 2,
                       -front_height / 2 - eps, 1.0])
                cube([usb_window_width, front_wall + 1.2,
                      usb_window_depth]);

            for (x = [-43.0, -29.0])
                translate([x - 4.0, -front_height / 2 - eps, 16.0])
                    cube([8.0, front_wall + 1.2, 7.0]);

            for (sx = [-1, 1])
                translate([sx < 0 ? -front_width / 2 - eps
                                  : front_width / 2 - front_wall - 0.5,
                           5.0, 3.0])
                    cube([front_wall + 0.7, 10.0, 8.0]);
        }

        // Heat-set bores for the four removable-cover screws. Inserts are
        // installed from the open rear before the carrier is fitted.
        for (x = [-cover_screw_x, cover_screw_x])
            for (y = [-cover_screw_y, cover_screw_y])
                translate([x, y, -eps])
                    cylinder(d = cover_insert_diameter,
                             h = cover_insert_depth + eps);

        // M3 heat-set insert bores open from each outer face. A smaller pilot
        // continues inward so an over-long screw cannot split the boss.
        for (sx = [-1, 1])
            translate([sx * pivot_x, pivot_y, pivot_z])
                rotate([0, 90, 0])
                    cylinder(d = 2.8,
                             h = pivot_boss_thickness + 2.0, center = true);
        for (sx = [-1, 1])
            translate([sx * (pivot_outer_x - pivot_insert_depth / 2),
                       pivot_y, pivot_z])
                rotate([0, 90, 0])
                    cylinder(d = pivot_insert_diameter,
                             h = pivot_insert_depth + eps, center = true);

        // M2 stop-screw inserts also enter from the case's outer faces.  A
        // 1.7 mm continuation hole gives screw-tip relief behind each insert.
        for (sx = [-1, 1])
            translate([sx * pivot_x,
                       pivot_y + stop_radius, pivot_z])
                rotate([0, 90, 0])
                    cylinder(d = 1.7,
                             h = pivot_boss_thickness + 2.0, center = true);
        for (sx = [-1, 1])
            translate([sx * (pivot_outer_x - stop_insert_depth / 2),
                       pivot_y + stop_radius, pivot_z])
                rotate([0, 90, 0])
                    cylinder(d = stop_insert_diameter,
                             h = stop_insert_depth + eps, center = true);
    }
}

// Lens-side face on the build plate; the large rear opening then prints upward
// without bridging the full enclosure. Only the small pivot bosses may need
// local support in FDM.
module front_case_print() {
    translate([0, 0, front_depth])
        rotate([180, 0, 0])
            front_case();
}

module front_cover() {
    // A 1 mm perimeter inset leaves 1.85 mm of material outside each 4.3 mm
    // countersink at the rounded corners.
    plate_w = front_width - 2.0;
    plate_h = front_height - 2.0;
    lip_outer_w = front_cavity_width - 0.90;
    lip_outer_h = front_cavity_height - 0.90;
    lip_wall = 1.2;

    difference() {
        union() {
            rounded_box(plate_w, plate_h, front_cover_thickness, 4.0);
            translate([0, 0, front_cover_thickness])
                difference() {
                    rounded_box(lip_outer_w, lip_outer_h,
                                front_cover_lip_depth, 3.0);
                    translate([0, 0, -eps])
                        rounded_box(lip_outer_w - 2 * lip_wall,
                                    lip_outer_h - 2 * lip_wall,
                                    front_cover_lip_depth + 2 * eps, 2.0);
                }
        }

        // Case mounting holes, countersunk on the head-facing side.
        for (x = [-cover_screw_x, cover_screw_x])
            for (y = [-cover_screw_y, cover_screw_y])
                translate([x, y, 0])
                    countersunk_hole(cover_screw_clearance, 4.3,
                                     front_cover_thickness +
                                     front_cover_lip_depth);

        // Four independent screws attach only the rigid carrier. No cover
        // fastener passes through or preloads the stereo PCB.
        for (x = [-carrier_mount_x, carrier_mount_x])
            for (y = [-carrier_mount_y, carrier_mount_y])
                translate([x, y, -eps])
                    countersunk_hole(carrier_screw_clearance, 4.3,
                                     front_cover_thickness +
                                     front_cover_lip_depth + 2 * eps);

        // Central inspection/air path remains behind the open carrier frame.
        translate([0, 0, -eps])
            rounded_slot(min(30.0, board_width - 28.0),
                         max(7.0, board_height - 9.0),
                         front_cover_thickness +
                         front_cover_lip_depth + 2 * eps, 2.5);
    }
}

// Rigid ladder frame. Four equal-height seats support the PCB only around its
// factory mounting holes. M1.6 (3290) or provisional M2 (3372_fit) screws enter
// from the carrier's flat underside and use washers/nuts on the PCB side.
module board_carrier() {
    rail_w = 3.2;
    // The rail ends stop short of the case's four cover-insert bosses.  The
    // corner PCB seats overlap the shortened rails and keep the frame closed.
    horizontal_rail_length = board_width - 8.0;
    board_seat_d = profile_is_3290 ? 5.4 : 6.0;
    mount_boss_h = carrier_mount_insert_depth + 0.8;
    cross_h = 2 * carrier_mount_y + rail_w;

    difference() {
        union() {
            // Two long rails and two cross rails form a torsionally stiff
            // frame while leaving PCB components and heat paths open.
            for (y = [-carrier_mount_y, carrier_mount_y])
                translate([0, y, 0])
                    rounded_box(horizontal_rail_length, rail_w,
                                carrier_base_thickness, 1.2);
            for (x = [-carrier_mount_x, carrier_mount_x])
                translate([x, 0, 0])
                    rounded_box(rail_w, cross_h,
                                carrier_base_thickness, 1.2);

            // Equal-Z board seats. Their centres follow the published 3290
            // corner-hole pattern or the explicitly provisional 3372 pattern.
            for (x = [-board_mount_column_x, board_mount_column_x])
                for (y = [-board_mount_row_y, board_mount_row_y])
                    translate([x, y, 0])
                        cylinder(d = board_seat_d, h = board_plane_z);

            // Carrier-to-cover bosses stop below the PCB plane, leaving an
            // air gap even where the board overhangs them.
            for (x = [-carrier_mount_x, carrier_mount_x])
                for (y = [-carrier_mount_y, carrier_mount_y])
                    translate([x, y, 0])
                        cylinder(d = carrier_mount_boss_diameter,
                                 h = mount_boss_h);

            // Pull tab is reached after the cover is removed.
            translate([0, carrier_mount_y - 1.0, 0])
                rounded_box(13.0, 6.0, 3.2, 1.8);
        }

        // Captive, flush board-screw heads. The delivered PCB decides whether
        // the provisional M1.6/M2 fastener is retained.
        for (x = [-board_mount_column_x, board_mount_column_x])
            for (y = [-board_mount_row_y, board_mount_row_y])
                translate([x, y, -eps])
                    counterbored_hole(board_fastener_clearance,
                                      board_fastener_head_diameter,
                                      board_fastener_head_recess,
                                      board_plane_z + 2 * eps);

        // A small through-pilot accepts the cover screw. HSB-203030 inserts
        // enter from the printable top of each boss, avoiding first-layer
        // distortion at the carrier's flat underside.
        for (x = [-carrier_mount_x, carrier_mount_x])
            for (y = [-carrier_mount_y, carrier_mount_y])
                translate([x, y, -eps])
                    cylinder(d = 2.15, h = mount_boss_h + 2 * eps);
        for (x = [-carrier_mount_x, carrier_mount_x])
            for (y = [-carrier_mount_y, carrier_mount_y])
                translate([x, y,
                           mount_boss_h - carrier_mount_insert_depth])
                    cylinder(d = carrier_mount_insert_diameter,
                             h = carrier_mount_insert_depth + eps);
    }
}

// Fast, low-material check of the public board outline, corner-hole pattern,
// lens centres and barrel diameter. Print this before the complete front case.
module board_gauge() {
    gauge_t = 1.2;
    frame_w = 2.0;
    difference() {
        union() {
            difference() {
                rounded_box(board_width, board_height, gauge_t, 1.0);
                translate([0, 0, -eps])
                    rounded_slot(board_width - 2 * frame_w,
                                 board_height - 2 * frame_w,
                                 gauge_t + 2 * eps, 0.7);
            }
            for (x = [-lens_baseline / 2, lens_baseline / 2])
                translate([x, lens_window_y, 0])
                    difference() {
                        cylinder(d = lens_barrel_diameter + 2.4,
                                 h = gauge_t);
                        translate([0, 0, -eps])
                            cylinder(d = lens_barrel_diameter + 0.4,
                                     h = gauge_t + 2 * eps);
                    }
        }
        for (x = [-board_mount_column_x, board_mount_column_x])
            for (y = [-board_mount_row_y, board_mount_row_y])
                translate([x, y, -eps])
                    cylinder(d = board_mount_hole_diameter,
                             h = gauge_t + 2 * eps);
    }
}

// ---------------------------------------------------------------------------
// Front strap yoke and angle pivot
// ---------------------------------------------------------------------------
module yoke_arm_right(plate_w, plate_d, arm_x, arm_t,
                      pivot_global_z) {
    arm_z0 = plate_d - 0.2;
    arm_top = pivot_global_z + pivot_boss_radius + 1.0;
    arm_y_height = 21.0;
    bridge_x0 = plate_w / 2 - 4.0;
    bridge_x1 = arm_x + arm_t / 2;
    bridge_w = bridge_x1 - bridge_x0;

    // Rounded vertical arm.
    translate([arm_x, pivot_y, arm_z0])
        rounded_box(arm_t, arm_y_height,
                    arm_top - arm_z0, 1.7);

    // The strap ear sits inboard. This low bridge joins the outboard arm to
    // the yoke below the 21.5 mm-high strap path.
    translate([bridge_x0 + bridge_w / 2,
               pivot_y - 6.0, 0])
        rounded_box(bridge_w, 8.0, plate_d, 1.8);

    // The 5 mm arm overlaps the low bridge by 0.2 mm. Keeping the connection
    // below the pivot boss preserves clearance throughout the 0-25 deg sweep.
}

module front_yoke() {
    plate_w = front_width + 1.0;
    plate_h = front_height + 1.0;
    plate_d = 3.0;
    arm_t = 5.0;
    case_pivot_outer_x = front_width / 2 + pivot_boss_thickness -
                         pivot_boss_overlap;
    arm_inner_x = case_pivot_outer_x + pivot_side_clearance;
    arm_x = arm_inner_x + arm_t / 2;
    pivot_global_z = front_case_head_gap + pivot_z;
    ear_w = strap_slot_depth + 2 * strap_bar_width;
    ear_x = plate_w / 2 - ear_w / 2 + 1.5;
    pad_x = min(28.0, plate_w / 4);

    difference() {
        union() {
            rounded_box(plate_w, plate_h, plate_d, 7.0);
            vertical_band_ear(-ear_x, plate_d, 31.0);
            vertical_band_ear( ear_x, plate_d, 31.0);

            yoke_arm_right(plate_w, plate_d, arm_x, arm_t,
                           pivot_global_z);
            mirror([1, 0, 0])
                yoke_arm_right(plate_w, plate_d, arm_x, arm_t,
                               pivot_global_z);
        }

        // Yoke pivot clearances plus a shallow outside recess for a low-head
        // M3 screw. The screw threads into the insert in the case boss.
        for (sx = [-1, 1])
            translate([sx * arm_x, pivot_y, pivot_global_z])
                rotate([0, 90, 0])
                    cylinder(d = pivot_screw_clearance,
                             h = arm_t + 2 * eps, center = true);
        for (sx = [-1, 1])
            translate([sx * (arm_x + arm_t / 2 - pivot_head_recess / 2),
                       pivot_y, pivot_global_z])
                rotate([0, 90, 0])
                    cylinder(d = pivot_head_diameter,
                             h = pivot_head_recess + 2 * eps, center = true);

        // Through-slots receive removable M2 stop screws after the M3 pivot is
        // assembled.  A shallow track on each outside face seats the low head.
        for (sx = [-1, 1]) {
            stop_arc_channel(sx * arm_x, stop_slot_diameter,
                             arm_t + 2 * eps, pivot_global_z);
            stop_arc_channel(
                sx * (arm_x + arm_t / 2 - stop_head_track_depth / 2),
                stop_head_track_diameter,
                stop_head_track_depth + 2 * eps,
                pivot_global_z
            );
        }

        // The inboard ears overlap the yoke plate, so repeat the slot cut at
        // assembly level. The outboard pivot arms are now clear of this path.
        for (sx = [-1, 1])
            translate([sx * ear_x, 0, -eps])
                rounded_slot(strap_slot_depth, strap_slot_height,
                             plate_d + 2 * eps, strap_slot_radius);

        // Air and sweat paths behind the camera module. The narrow side slots
        // stay beyond the two broad contact pads.
        for (x = [-plate_w / 2 + 10.0, plate_w / 2 - 10.0])
            translate([x, 0, -eps])
                rounded_slot(7.0, min(20.0, plate_h - 12.0),
                             plate_d + 2 * eps, 2.5);
        translate([0, 0, -eps])
            rounded_slot(18.0, min(22.0, plate_h - 10.0),
                         plate_d + 2 * eps, 4.0);

        // Centre marks for two broad 4-5 mm EVA/Poron contact pads. Through
        // holes remain visible and print cleanly with the head side on the bed.
        for (x = [-pad_x, pad_x])
            translate([x, 0, -eps])
                cylinder(d = 2.0, h = plate_d + 2 * eps);

        // Cable-tie holes beside the wearer's right strap.
        for (y = [-5, 5])
            translate([plate_w / 2 - 20.0, y, -eps])
                cylinder(d = 3.0, h = plate_d + 2 * eps);
    }
}

// ---------------------------------------------------------------------------
// Rear A1653 open cage
// ---------------------------------------------------------------------------
module rear_cradle() {
    inner_w = battery_width + battery_clearance_xy;
    inner_h = battery_height + battery_clearance_xy;
    inner_d = battery_depth + battery_clearance_z;
    outer_w = inner_w + 2 * rear_wall;
    outer_h = inner_h + 2 * rear_wall;
    battery_back_z = rear_backplate_thickness + rear_air_gap;
    cage_front_z = battery_back_z + inner_d;
    ear_w = strap_slot_depth + 2 * strap_bar_width;
    ear_x = outer_w / 2 + ear_w / 2 - 2.5;
    boss_x = inner_w / 2 + rear_wall / 2;
    // Screw pillars sit just outside the nominal rectangular battery envelope,
    // rather than relying on the unmeasured corner radius of the A1653.
    boss_r = 4.0;
    boss_y = inner_h / 2 + boss_r;
    rail_z = rear_backplate_thickness - 0.2;
    rail_depth = cage_front_z - rail_z;

    difference() {
        union() {
            // Head-side mounting plate.
            rounded_box(outer_w, outer_h,
                        rear_backplate_thickness, 6.0);
            vertical_band_ear(-ear_x, rear_backplate_thickness, 31.0);
            vertical_band_ear( ear_x, rear_backplate_thickness, 31.0);

            // Four small bridges create a real air gap behind the battery.
            for (x = [-inner_w / 2 + 10, inner_w / 2 - 10])
                for (y = [-inner_h / 2 + 6, inner_h / 2 - 6])
                    translate([x, y, rear_backplate_thickness])
                        rounded_box(14.0, 7.0, rear_air_gap, 2.0);

            // Left/right and bottom battery rails.
            for (sx = [-1, 1])
                translate([sx * (inner_w / 2 + rear_wall / 2), 0,
                           rail_z])
                    rounded_box(rear_wall, outer_h,
                                rail_depth, 1.0);

            translate([0, -(inner_h / 2 + rear_wall / 2),
                       rail_z])
                rounded_box(outer_w, rear_wall,
                            rail_depth, 1.0);

            // Split top rail leaves the folded USB-C hinge untouched.
            top_segment_w = (outer_w - rear_top_hinge_keepout) / 2;
            for (sx = [-1, 1])
                translate([sx * (rear_top_hinge_keepout / 2 +
                                  top_segment_w / 2),
                           inner_h / 2 + rear_wall / 2,
                           rail_z])
                    rounded_box(top_segment_w, rear_wall,
                                rail_depth, 1.0);

            // Retainer screw pillars live outside the battery corners.
            for (x = [-boss_x, boss_x])
                for (y = [-boss_y, boss_y])
                    union() {
                        translate([x, y, rear_backplate_thickness])
                            cylinder(r1 = boss_r + 0.8, r2 = boss_r,
                                     h = 2.0);
                        translate([x, y,
                                   rear_backplate_thickness + 1.8])
                            cylinder(r = boss_r,
                                     h = cage_front_z -
                                         rear_backplate_thickness - 1.8);
                    }
        }

        // Ventilation slot through the head-side plate, between the pads.
        translate([0, 0, -eps])
            rounded_slot(16.0, 25.0,
                         rear_backplate_thickness + 2 * eps, 3.5);

        // Downward paths keep the 3 mm rear air space connected to ambient
        // air even when fabric lies across the outer retainer.
        for (x = [-27, -9, 9, 27])
            translate([x - 4.0,
                       -inner_h / 2 - rear_wall - eps,
                       rear_backplate_thickness])
                cube([8.0, 2 * rear_wall + 2 * eps,
                      rear_air_gap + 1.0]);

        // Centre marks for two broad 4-5 mm foam contact pads.
        for (x = [-23, 23])
            translate([x, 0, -eps])
                cylinder(d = 2.0,
                         h = rear_backplate_thickness + 2 * eps);

        // A1653 USB-C IN/OUT opening on the right end, with room for the
        // moulded plug and its first bend.
        translate([inner_w / 2 - eps,
                   rear_port_center_y - rear_port_open_height / 2,
                   battery_back_z + rear_port_z_from_battery_back])
            cube([rear_wall + 2 * eps,
                  rear_port_open_height,
                  rear_port_open_depth]);

        // Button access on the left end.
        translate([-inner_w / 2 - rear_wall - eps,
                   rear_button_center_y - 8.0,
                   battery_back_z + rear_button_z_from_battery_back])
            cube([rear_wall + 2 * eps, 16.0, 17.0]);

        // Pilot holes for the removable open-frame retainer.
        for (x = [-boss_x, boss_x])
            for (y = [-boss_y, boss_y])
                translate([x, y, cage_front_z - 7.0])
                    cylinder(d = rear_screw_pilot, h = 9.0);

        // Cable-tie holes beside the right strap.
        for (y = [-5, 5])
            translate([outer_w / 2 - 4.0, y, -eps])
                cylinder(d = 3.0,
                         h = rear_backplate_thickness + 2 * eps);
    }
}

module rear_retainer() {
    inner_w = battery_width + battery_clearance_xy;
    inner_h = battery_height + battery_clearance_xy;
    outer_w = inner_w + 2 * rear_wall;
    outer_h = inner_h + 2 * rear_wall;
    boss_r = 4.0;
    boss_x = inner_w / 2 + rear_wall / 2;
    boss_y = inner_h / 2 + boss_r;
    open_w = inner_w - 9.0;
    open_h = inner_h - 9.0;
    fabric_guard_w = 2.6;
    cell_w = (open_w - fabric_guard_w) / 2;
    cell_h = (open_h - fabric_guard_w) / 2;
    subcell_w = (cell_w - fabric_guard_w) / 2;

    difference() {
        union() {
            rounded_box(outer_w, outer_h,
                        rear_retainer_thickness, 5.5);
            // Four screw ears keep the complete counterbore inside material.
            for (x = [-boss_x, boss_x])
                for (y = [-boss_y, boss_y])
                    translate([x, y, 0])
                        cylinder(r = boss_r,
                                 h = rear_retainer_thickness);
        }
        // Eight open cells leave a centre cross and two additional vertical
        // ribs. The maximum fabric span is about 16 mm, keeping stretch cap
        // material out of the 2 mm battery clearance.
        for (big_x = [-(cell_w + fabric_guard_w) / 2,
                       (cell_w + fabric_guard_w) / 2])
            for (x = [big_x - (subcell_w + fabric_guard_w) / 2,
                       big_x + (subcell_w + fabric_guard_w) / 2])
            for (y = [-(cell_h + fabric_guard_w) / 2 - 1.0,
                       (cell_h + fabric_guard_w) / 2 - 1.0])
                translate([x, y, -eps])
                    rounded_slot(subcell_w, cell_h,
                                 rear_retainer_thickness + 2 * eps, 2.0);

        // Leave the port-side upper quadrant completely clear.
        translate([inner_w / 2 - 2.0,
                   rear_port_center_y - 11.0, -eps])
            cube([rear_wall + 5.0, 22.0,
                  rear_retainer_thickness + 2 * eps]);

        // The folded built-in USB-C connector sits in the upper long edge.
        // This notch mirrors the cradle keep-out so the retainer cannot press
        // its hinge from the front corner.
        translate([-rear_top_hinge_keepout / 2,
                   inner_h / 2 - 5.0,
                   -eps])
            cube([rear_top_hinge_keepout, rear_wall + 8.0,
                  rear_retainer_thickness + 2 * eps]);

        for (x = [-boss_x, boss_x])
            for (y = [-boss_y, boss_y])
                translate([x, y, rear_retainer_thickness])
                    rotate([180, 0, 0])
                        counterbored_hole(cover_screw_clearance, 4.6, 1.0,
                                          rear_retainer_thickness);
    }
}

// Battery-facing side on the build plate, leaving the four screw-head
// counterbores facing upward and dimensionally clean.
module rear_retainer_print() {
    rear_retainer();
}

// Two TPU washers occupy most of each 0.7 mm pivot gap. Their small residual
// clearance allows angle adjustment without hard plastic rubbing on plastic.
module pivot_washer() {
    difference() {
        cylinder(d = pivot_washer_outer_diameter,
                 h = pivot_washer_thickness);
        translate([0, 0, -eps])
            cylinder(d = pivot_washer_inner_diameter,
                     h = pivot_washer_thickness + 2 * eps);
    }
}

// ---------------------------------------------------------------------------
// Fit coupon and cable clip
// ---------------------------------------------------------------------------
module band_coupon() {
    coupon_w = 66.0;
    coupon_h = 31.0;
    coupon_d = 4.0;
    slot_depths = [3.5, 4.0, 4.5];
    difference() {
        rounded_box(coupon_w, coupon_h, coupon_d, 4.0);
        for (i = [0 : 2])
            translate([-22.0 + i * 22.0, 0, -eps])
                rounded_slot(slot_depths[i], strap_slot_height,
                             coupon_d + 2 * eps,
                             min(1.6, slot_depths[i] / 2 - 0.1));
    }

    // One, two, or three tactile nibs identify 3.5 / 4.0 / 4.5 mm.
    for (i = [0 : 2])
        for (j = [0 : i])
            translate([-22.0 + i * 22.0 + (j - i / 2) * 2.8,
                       -13.0, coupon_d])
                cylinder(d = 1.5, h = 0.7);
}

module band_pull_coupon() {
    coupon_w = 64.0;
    coupon_h = 38.0;
    coupon_d = 3.0;
    // Copies the yoke's outer ligament: slot centre is 6.25 mm from the base
    // edge and the ear projects another 1.5 mm beyond it.
    ear_x = coupon_w / 2 - 6.25;
    difference() {
        union() {
            rounded_box(coupon_w, coupon_h, coupon_d, 5.0);
            vertical_band_ear(ear_x, coupon_d, 31.0);
        }
        // Assembly-level slot also cuts the underlying base, matching yoke.
        translate([ear_x, 0, -eps])
            rounded_slot(strap_slot_depth, strap_slot_height,
                         coupon_d + 2 * eps, strap_slot_radius);
        // Attach cord or a luggage scale through both holes during pull tests.
        for (y = [-8.0, 8.0])
            translate([-20.0, y, -eps])
                cylinder(d = 6.0, h = coupon_d + 2 * eps);
    }
}

module insert_coupon() {
    coupon_w = 58.0;
    coupon_h = 34.0;
    coupon_d = 6.0;
    m3_bores = [4.2, 4.55, 4.8];
    m2_bores = [2.8, 3.05, 3.3];
    m3_depth = 4.6;
    m2_depth = 3.6;
    difference() {
        rounded_box(coupon_w, coupon_h, coupon_d, 3.0);
        for (i = [0 : 2])
            translate([-15.0 + i * 15.0, 7.0,
                       coupon_d - m3_depth])
                cylinder(d = m3_bores[i], h = m3_depth + eps);
        for (i = [0 : 2])
            translate([-15.0 + i * 15.0, -7.0,
                       coupon_d - m2_depth])
                cylinder(d = m2_bores[i], h = m2_depth + eps);
    }
    // Column nibs identify the small/medium/large pilot. One left-edge bar
    // marks the M3 row; two bars mark the M2 row without relying on tiny text.
    for (i = [0 : 2])
        for (j = [0 : i])
            translate([-15.0 + i * 15.0 + (j - i / 2) * 2.6,
                       15.0, coupon_d])
                cylinder(d = 1.4, h = 0.7);
    translate([-26.0, 7.0, coupon_d])
        cube([5.0, 1.2, 0.7], center = true);
    for (y = [-8.3, -5.7])
        translate([-26.0, y, coupon_d])
            cube([5.0, 1.2, 0.7], center = true);
}

// The pivot and stop inserts enter along horizontal FDM bores. This standing
// block repeats the same candidate diameters and insertion depths in X.
module insert_coupon_horizontal() {
    coupon_w = 12.0;
    coupon_h = 58.0;
    coupon_d = 16.0;
    m3_bores = [4.2, 4.55, 4.8];
    m2_bores = [2.8, 3.05, 3.3];
    m3_depth = 4.6;
    m2_depth = 3.6;
    difference() {
        rounded_box(coupon_w, coupon_h, coupon_d, 2.5);
        for (i = [0 : 2])
            translate([coupon_w / 2 - m3_depth,
                       -15.0 + i * 15.0, 11.3])
                rotate([0, 90, 0])
                    cylinder(d = m3_bores[i], h = m3_depth + eps);
        for (i = [0 : 2])
            translate([coupon_w / 2 - m2_depth,
                       -15.0 + i * 15.0, 4.5])
                rotate([0, 90, 0])
                    cylinder(d = m2_bores[i], h = m2_depth + eps);
    }
    // One/two/three top nibs identify the three Y positions.
    for (i = [0 : 2])
        for (j = [0 : i])
            translate([(j - i / 2) * 2.2,
                       -15.0 + i * 15.0, coupon_d])
                cylinder(d = 1.2, h = 0.7);
}

module rear_screw_coupon() {
    coupon_w = 42.0;
    coupon_h = 16.0;
    coupon_d = 10.0;
    pilots = [1.6, 1.7, 1.8];
    difference() {
        rounded_box(coupon_w, coupon_h, coupon_d, 3.0);
        for (i = [0 : 2])
            translate([-13.0 + i * 13.0, 0, 2.0])
                cylinder(d = pilots[i], h = coupon_d - 2.0 + eps);
    }
    for (i = [0 : 2])
        for (j = [0 : i])
            translate([-13.0 + i * 13.0 + (j - i / 2) * 2.2,
                       -6.8, coupon_d])
                cylinder(d = 1.2, h = 0.6);
}

module cable_clip() {
    clip_length = 16.0;
    clip_width = 29.0;
    clip_height = 7.0;
    strap_tunnel_width = strap_nominal_width + 0.4;
    strap_tunnel_depth = strap_slot_depth + 0.4;
    strap_center_y = -3.0;
    cable_center_y = 10.8;
    cable_clear_d = cable_diameter + 1.0;
    cable_snap_slit = 1.8;
    difference() {
        rounded_box(clip_length, clip_width, clip_height, 2.5);

        // Strap and cable both run along X (front-to-rear on the head). The
        // closed strap tunnel is threaded on before the band buckle returns.
        translate([-clip_length / 2 - eps,
                   strap_center_y - strap_tunnel_width / 2,
                   (clip_height - strap_tunnel_depth) / 2])
            cube([clip_length + 2 * eps, strap_tunnel_width,
                  strap_tunnel_depth]);

        // Parallel cable bore with a generous side slit. Print this flexible
        // clip in TPU; use reusable hook-and-loop ties for a PETG-only build.
        translate([-clip_length / 2 - eps, cable_center_y,
                   clip_height / 2])
            rotate([0, 90, 0])
                cylinder(d = cable_clear_d,
                         h = clip_length + 2 * eps);
        translate([-clip_length / 2 - eps, cable_center_y,
                   clip_height / 2 - cable_snap_slit / 2])
            cube([clip_length + 2 * eps,
                  clip_width / 2 - cable_center_y + eps, cable_snap_slit]);
    }
}

// Printed on its narrow side so the 19.4 mm strap tunnel is vertical rather
// than a long unsupported bridge. A brim is useful for the 16 x 7 mm footprint.
module cable_clip_print() {
    translate([0, 0, 29.0 / 2])
        rotate([90, 0, 0])
            cable_clip();
}

// ---------------------------------------------------------------------------
// Visual-only dummies and assemblies
// ---------------------------------------------------------------------------
module dummy_board() {
    board_z = board_plane_z;
    color([0.05, 0.42, 0.22])
        translate([0, 0, board_z])
            rounded_box(board_width, board_height, board_thickness, 1.2);
    for (x = [-lens_baseline / 2, lens_baseline / 2]) {
        color([0.08, 0.08, 0.09])
            translate([x, lens_window_y, board_z + board_thickness])
                cylinder(d = lens_barrel_diameter,
                         h = lens_height_from_pcb);
        color([0.15, 0.25, 0.32])
            translate([x, lens_window_y,
                       board_z + board_thickness + lens_height_from_pcb])
                cylinder(d = lens_barrel_diameter * 0.55, h = 0.6);
    }
}

module dummy_battery() {
    color([0.12, 0.13, 0.15])
        rounded_box(battery_width, battery_height,
                    battery_depth, 6.0);
}

module moving_front_hardware(angle) {
    pivot_global_z = front_case_head_gap + pivot_z;
    translate([0, pivot_y, pivot_global_z])
        rotate([angle, 0, 0])
            translate([0, -pivot_y, -pivot_z]) {
                front_case();
                translate([0, 0, -front_cover_thickness]) front_cover();
                board_carrier();
            }
}

// Debug-only solids. An empty result is the pass condition.
module debug_case_carrier_overlap() {
    intersection() {
        front_case();
        board_carrier();
    }
}

module debug_cover_carrier_overlap() {
    intersection() {
        translate([0, 0, -front_cover_thickness]) front_cover();
        // Ignore the intended flat seating contact at Z=0.
        translate([0, 0, 0.02]) board_carrier();
    }
}

module debug_case_board_overlap() {
    intersection() {
        front_case();
        dummy_board();
    }
}

module debug_yoke_overlap(angle) {
    intersection() {
        front_yoke();
        moving_front_hardware(angle);
    }
}

module front_preview() {
    pivot_global_z = front_case_head_gap + pivot_z;
    color([0.16, 0.17, 0.19]) front_yoke();

    // Case and its contents rotate as one about the low side pivot.
    translate([0, pivot_y, pivot_global_z])
        rotate([camera_down_angle, 0, 0])
            translate([0, -pivot_y, -pivot_z]) {
                color([0.32, 0.34, 0.37]) front_case();
                color([0.23, 0.24, 0.27])
                    translate([0, 0, -front_cover_thickness])
                        front_cover();
                color([0.62, 0.55, 0.22]) board_carrier();
                dummy_board();
            }

    // Short pieces merely show the two independent left/right bands.
    for (sx = [-1, 1])
        color([0.04, 0.04, 0.045])
            translate([sx * 85.0, 0, 1.4])
                cube([28.0, strap_nominal_width, 1.8], center = true);
}

module front_exploded() {
    color([0.16, 0.17, 0.19]) front_yoke();
    color([0.23, 0.24, 0.27])
        translate([0, 0, 13.0]) front_cover();
    color([0.62, 0.55, 0.22])
        translate([0, 0, 24.0]) board_carrier();
    translate([0, 0, 30.0]) dummy_board();
    color([0.32, 0.34, 0.37])
        translate([0, 0, 55.0]) front_case();
}

module rear_preview() {
    inner_d = battery_depth + battery_clearance_z;
    battery_back_z = rear_backplate_thickness + rear_air_gap;
    color([0.18, 0.19, 0.21]) rear_cradle();
    translate([0, 0, battery_back_z]) dummy_battery();
    color([0.31, 0.33, 0.36])
        translate([0, 0, battery_back_z + inner_d])
            rear_retainer();

    for (sx = [-1, 1])
        color([0.04, 0.04, 0.045])
            translate([sx * 67.0, 0, 1.3])
                cube([28.0, strap_nominal_width, 1.8], center = true);
}

module rear_exploded() {
    battery_back_z = rear_backplate_thickness + rear_air_gap;
    color([0.18, 0.19, 0.21]) rear_cradle();
    translate([0, 0, battery_back_z + 39.0]) dummy_battery();
    color([0.31, 0.33, 0.36])
        translate([0, 0, battery_back_z + 78.0]) rear_retainer();
}

module debug_rear_retainer_overlap() {
    inner_d = battery_depth + battery_clearance_z;
    cage_front_z = rear_backplate_thickness + rear_air_gap + inner_d;
    intersection() {
        rear_cradle();
        // Ignore the intended seating plane shared by screw pillars/rails.
        translate([0, 0, cage_front_z + 0.02]) rear_retainer();
    }
}

module debug_rear_battery_overlap() {
    battery_back_z = rear_backplate_thickness + rear_air_gap;
    intersection() {
        rear_cradle();
        // Ignore the intended contact with the four air-gap support bridges.
        translate([0, 0, battery_back_z + 0.02]) dummy_battery();
    }
}

if (part == "front_case") front_case_print();
else if (part == "front_cover") front_cover();
else if (part == "board_carrier") board_carrier();
else if (part == "board_gauge") board_gauge();
else if (part == "front_yoke") front_yoke();
else if (part == "rear_cradle") rear_cradle();
else if (part == "rear_retainer") rear_retainer_print();
else if (part == "pivot_washer") pivot_washer();
else if (part == "band_coupon") band_coupon();
else if (part == "band_pull_coupon") band_pull_coupon();
else if (part == "insert_coupon") insert_coupon();
else if (part == "insert_coupon_horizontal") insert_coupon_horizontal();
else if (part == "rear_screw_coupon") rear_screw_coupon();
else if (part == "cable_clip") cable_clip_print();
else if (part == "debug_case_carrier_overlap")
    debug_case_carrier_overlap();
else if (part == "debug_cover_carrier_overlap")
    debug_cover_carrier_overlap();
else if (part == "debug_case_board_overlap")
    debug_case_board_overlap();
else if (part == "debug_yoke_overlap_min")
    debug_yoke_overlap(camera_angle_min);
else if (part == "debug_yoke_overlap_max")
    debug_yoke_overlap(camera_angle_max);
else if (part == "debug_yoke_overlap_angle")
    debug_yoke_overlap(camera_down_angle);
else if (part == "debug_rear_retainer_overlap")
    debug_rear_retainer_overlap();
else if (part == "debug_rear_battery_overlap")
    debug_rear_battery_overlap();
else if (part == "front_exploded") front_exploded();
else if (part == "rear_preview") rear_preview();
else if (part == "rear_exploded") rear_exploded();
else front_preview();
