"""Screen-wide action rules for connected, copying and approval states."""

import unittest

from rootlens_import.screen_state import Phase, ScreenState, screen_phase


class ScreenStateTests(unittest.TestCase):
    def test_connected_copy_allows_finished_rows_and_blocks_loading_rows(self):
        phase = screen_phase(profile=object(), job="import", connected=True,
                             uploading=False, switching=False, deleting=False, closing=False)
        self.assertEqual(phase, Phase.COPYING)
        self.assertTrue(ScreenState(phase, "ready", source_available=True, drive_ready=True).can_approve)
        self.assertTrue(ScreenState(phase, "problem", problem_accessible=True).can_delete)
        self.assertFalse(ScreenState(phase, "none").can_delete)

    def test_upload_and_pending_delete_lock_related_actions_without_losing_site_switch(self):
        for phase in (Phase.COPYING_AND_APPROVING, Phase.APPROVING,
                      Phase.WAITING_TO_DELETE, Phase.DELETING):
            state = ScreenState(phase, "ready", source_available=True, drive_ready=True)
            self.assertFalse(state.can_approve)
            self.assertFalse(state.can_delete)
            self.assertTrue(state.can_switch_site)

    def test_disconnected_site_can_switch_but_cannot_change_device(self):
        state = ScreenState(Phase.DISCONNECTED, "problem", problem_accessible=True)
        self.assertTrue(state.can_switch_site)
        self.assertTrue(state.can_connect)
        self.assertFalse(state.can_delete)


if __name__ == "__main__":
    unittest.main()
