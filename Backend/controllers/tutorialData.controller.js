import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { purgeTutorialData } from "../services/tutorialData.service.js";

// Called from the "how does Ohnix work" tour's finish screen. Deletes every
// record the tour created for this account (flagged isTutorialData at
// creation) - the only endpoint in the app allowed to delete a
// Purchase/Order, and only because these specific rows are guaranteed
// synthetic practice data, never a real business record.
const deleteTutorialData = asyncHandler(async (req, res) => {
    const result = await purgeTutorialData(req.user.prismaId);

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Tutorial data removed successfully"));
});

export { deleteTutorialData };
