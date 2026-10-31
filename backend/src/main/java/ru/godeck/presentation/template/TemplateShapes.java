package ru.godeck.presentation.template;


import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFGroupShape;
import org.apache.poi.xslf.usermodel.XSLFShape;

import java.awt.geom.Rectangle2D;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Stable shape traversal, marker recognition and coordinate conventions shared by all template paths. */
final class TemplateShapes {
    private TemplateShapes() {}
    static final Pattern TOKEN = Pattern.compile("\\{\\{([A-Za-z_][A-Za-z0-9_]*)}}");
    /** POI's Dimension truncates fractional points; raw EMU dimensions preserve export geometry. */
    static Rectangle2D pageBounds(XMLSlideShow show) {
        var size = show.getCTPresentation().getSldSz();
        return new Rectangle2D.Double(0, 0, size.getCx() / 12_700.0, size.getCy() / 12_700.0);
    }

    static String textLayoutId(int slideNumber, int layoutIndex) {
        return "slide-" + slideNumber + "-layout-" + layoutIndex;
    }

    /**
     * Flattens top-level and grouped shapes in document order. The order is part of the stable
     * editor layout-id contract, so both manifest creation and rendering use this method.
     */
    static List<XSLFShape> allShapes(List<XSLFShape> shapes) {
        List<XSLFShape> result = new ArrayList<>();
        for (XSLFShape shape : shapes) {
            result.add(shape);
            if (shape instanceof XSLFGroupShape group) result.addAll(allShapes(group.getShapes()));
        }
        return result;
    }

}
