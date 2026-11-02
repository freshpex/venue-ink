# Photography provenance

The 20 photographs in `public/images` are downloaded Pexels photographs, not AI generated imagery. Individual photo pages, photographer names, alt text, exact download URLs, dimensions, file sizes, and verification dates are recorded in `src/data/image-manifest.json`.

Source pages and their free-use labels were checked with online research on 2 November 2026. Downloads were obtained through the image links exposed by those pages. The public files are locally hosted WebP derivatives, with a maximum dimension of 1920 pixels and quality 84. Their original photographic content was retained; only resizing, orientation correction, RGB conversion, and compression were applied.

## License and presentation

[Pexels License](https://www.pexels.com/license/) permits downloading, modifying, and using photographs in websites. Attribution is appreciated but not required. The license prohibits implying endorsement by the people or brands shown. It also restricts offensive depictions, stock redistribution, unaltered resale, and use as trademarks. The source license remains controlling.

These are illustrative stock photographs. The people, tattoos, and studios shown have not been verified as Venue customers, employees, affiliated artists, or participating businesses. Do not pair them with a real testimonial author, identify them as a specific Venue member, or suggest the artwork is available for booking. Example profile imagery must remain clearly contextualized as part of the interactive product preview. A filename containing `artist` describes the intended visual slot, not a verified occupation or affiliation of a model.

No official Venue photography was copied into this implementation. Brand screenshots, product UI, and photographed subjects are distinct sources and should not be conflated.

## Image inventory

| Local filename              | Photographer      | Original photo page                                                                                          |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| hero-tattoo-session.webp    | Matheus Bertelli  | [35833273](https://www.pexels.com/photo/tattoo-artist-in-studio-creating-detailed-body-art-35833273/)        |
| tattoo-floral-detail.webp   | cottonbro studio  | [4123886](https://www.pexels.com/photo/person-with-tattoo-on-right-leg-4123886/)                             |
| artist-at-work.webp         | Fabrizio Velez    | [20339300](https://www.pexels.com/photo/a-man-getting-a-tattoo-in-a-tattoo-studio-20339300/)                 |
| studio-session.webp         | cottonbro studio  | [5088509](https://www.pexels.com/photo/woman-in-a-tattoo-studio-5088509/)                                    |
| tattoo-process.webp         | Vitor Diniz       | [29211911](https://www.pexels.com/photo/tattoo-artist-at-work-in-studio-setting-29211911/)                   |
| studio-community.webp       | Kenneth Surillo   | [29547855](https://www.pexels.com/photo/tattoo-artist-at-work-in-studio-environment-29547855/)               |
| neon-tattoo-tools.webp      | cottonbro studio  | [4125530](https://www.pexels.com/photo/person-in-red-and-blue-long-sleeve-shirt-holding-brown-rope-4125530/) |
| tattoo-back-art.webp        | Brett Sayles      | [2221319](https://www.pexels.com/photo/full-body-tattoo-2221319/)                                            |
| tools-workstation.webp      | Antoni Shkraba    | [7005730](https://www.pexels.com/photo/close-up-shot-of-tattoo-equipment-7005730/)                           |
| studio-interior.webp        | Cedé Joey         | [28991531](https://www.pexels.com/photo/colorful-tattoo-studio-interior-with-artistic-murals-28991531/)      |
| artist-portrait-woman.webp  | Andy Jorgensen    | [22696317](https://www.pexels.com/photo/portrait-of-brunette-woman-with-tattoo-22696317/)                    |
| studio-vintage.webp         | Erik Mclean       | [15987322](https://www.pexels.com/photo/the-interior-of-a-tattoo-shop-15987322/)                             |
| tattoo-machine-flatlay.webp | Pavel Danilyuk    | [6593398](https://www.pexels.com/photo/tape-and-metal-items-6593398/)                                        |
| client-session.webp         | Andrea Piacquadio | [3914512](https://www.pexels.com/photo/woman-getting-tattoo-3914512/)                                        |
| artist-portrait-man.webp    | Hirsh Philippe    | [13345952](https://www.pexels.com/photo/close-up-photo-of-tattooed-man-13345952/)                            |
| tattoo-arm-floral.webp      | Kevin Bidwell     | [2183132](https://www.pexels.com/photo/man-with-floral-arm-tattoos-2183132/)                                 |
| tattoo-overhead.webp        | cottonbro studio  | [5088484](https://www.pexels.com/photo/woman-getting-a-tattoo-5088484/)                                      |
| tattoo-hands.webp           | Pavel Danilyuk    | [6593487](https://www.pexels.com/photo/a-hand-holding-a-tattoo-machine-6593487/)                             |
| tattoo-consultation.webp    | cottonbro studio  | [4125587](https://www.pexels.com/photo/man-and-woman-sitting-on-chair-4125587/)                              |
| artist-studio-portrait.webp | Pavel Danilyuk    | [6593369](https://www.pexels.com/photo/a-man-inside-a-tattoo-studio-6593369/)                                |

## Replacement guidance

Replace these illustrative photos with written-permission Venue member photography before presenting specific artist profiles, flash inventory, customer stories, or studio affiliations as factual. Keep the manifest synchronized when assets are replaced. Provide responsive dimensions and alt text from the manifest; use eager loading only for a page's main hero and lazy loading for images below the fold.
